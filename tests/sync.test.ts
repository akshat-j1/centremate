import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/sync/route";
const before = { ...process.env };
afterEach(() => {
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
