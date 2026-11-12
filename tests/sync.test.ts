import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/sync/route";
const before = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of [
    "FORM_SYNC_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]) {
    if (before[key] === undefined) delete process.env[key];
    else process.env[key] = before[key];
  }
});
function configure() {
  process.env.FORM_SYNC_SECRET = "test-secret-with-at-least-32-characters";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}
function request(body: string, token = "") {
  return new NextRequest("https://example.com/api/sync", {
    method: "POST",
    headers: { authorization: "Bearer " + token },
    body,
  });
}
test("sync stays disabled without a sufficiently strong secret", async () => {
  delete process.env.FORM_SYNC_SECRET;
  assert.equal((await POST(request("{}"))).status, 503);
  process.env.FORM_SYNC_SECRET = "short";
  assert.equal((await POST(request("{}"))).status, 503);
});
test("sync denies missing, incorrect, and multibyte tokens", async () => {
  configure();
  for (const token of [
    "",
    "wrong",
    "é".repeat(20),
    "x".repeat(process.env.FORM_SYNC_SECRET!.length),
  ])
    assert.equal((await POST(request("{}", token))).status, 401);
});
test("sync validates JSON and every row before database writes", async () => {
  configure();
  for (const body of [
    "invalid",
    "{}",
    '{"rows":[]}',
    '{"rows":[{"email":"invalid"}]}',
  ])
    assert.equal(
      (await POST(request(body, process.env.FORM_SYNC_SECRET))).status,
      400,
    );
});
test("sync enforces a streaming payload limit", async () => {
  configure();
  assert.equal(
    (
      await POST(
        request("x".repeat(1024 * 1024 + 1), process.env.FORM_SYNC_SECRET),
      )
    ).status,
    413,
  );
});

test("valid sync inserts private rows with conflict-ignore and reports accurate counts", async () => {
  configure();
  let called = false;
  globalThis.fetch = (async (input, init) => {
    called = true;
    assert.match(String(input), /rest\/v1\/registrations/);
    const headers = new Headers(init?.headers);
    assert.match(headers.get("prefer") ?? "", /resolution=ignore-duplicates/);
    const rows = JSON.parse(String(init?.body));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.visible, false);
      assert.equal(row.source, "form");
      assert.equal(row.email, "a@b.com");
      assert.equal("whatsapp" in row, false);
    }
    return new Response(JSON.stringify([{ id: "inserted" }]), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const row = {
    email: " A@B.COM ",
    name: "Student",
    hostel: "Uni 1",
    exam_id: "11111111-1111-4111-8111-111111111111",
    centre_id: "22222222-2222-4222-8222-222222222222",
    visible: true,
    whatsapp: "919999999999",
  };
  const response = await POST(
    request(JSON.stringify({ rows: [row, row] }), process.env.FORM_SYNC_SECRET),
  );
  assert.equal(response.status, 200);
  assert.equal(called, true);
  const data = await response.json();
  assert.equal(data.inserted, 1);
  assert.equal(data.skipped, 1);
  assert.equal(data.visibility, "private");
});
test("database outage is retryable without exposing service credentials", async () => {
  configure();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        message: "Internal detail that must stay private",
        code: "08006",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  const response = await POST(
    request(
      JSON.stringify({
        rows: [
          {
            email: "a@b.com",
            name: "Student",
            hostel: "Uni 1",
            exam_id: "11111111-1111-4111-8111-111111111111",
            centre_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
      process.env.FORM_SYNC_SECRET,
    ),
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(
    JSON.stringify(await response.json()),
    /Internal detail|test-only-not-a-real-key/,
  );
});
