import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/auth/callback/route";
import {
  safeReturnPath,
  registrationSchema,
  centreSchema,
  isReturning,
} from "../lib/workflows";
const centre = "22222222-2222-4222-8222-222222222222",
  exam = "11111111-1111-4111-8111-111111111111";
test("OAuth return paths preserve centre and exam and reject redirects outside the app", () => {
  const path = `/centre/${centre}?exam=${exam}`;
  assert.equal(safeReturnPath(path), path);
  assert.equal(safeReturnPath("/admin"), "/admin");
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth/callback",
    "/centre/no-id",
    "/\nevil",
  ])
    assert.equal(safeReturnPath(bad), "/");
  assert.equal(
    safeReturnPath("/?code=secret&error=bad&exam=" + exam),
    "/?exam=" + exam,
  );
});
test("OAuth failure safely returns to selected centre and clears navigation cookie", async () => {
  const target = `/centre/${centre}?exam=${exam}`;
  const req = new NextRequest(
    "https://centremate.example/auth/callback?error=denied",
    { headers: { cookie: "centremate_next=" + encodeURIComponent(target) } },
  );
  const res = await GET(req);
  const location = new URL(res.headers.get("location")!);
  assert.equal(location.pathname, `/centre/${centre}`);
  assert.equal(location.searchParams.get("exam"), exam);
  assert.equal(location.searchParams.get("error"), "signin");
  assert.match(res.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(res.headers.get("cache-control"), "no-store");
});
test("registration validation trims profile, normalizes contact and respects explicit consent", () => {
  const result = registrationSchema.parse({
    email: " STUDENT@EXAMPLE.COM ",
    exam_id: exam,
    centre_id: centre,
    name: " Student ",
    hostel: "Uni 2",
    departure: "07:30",
    whatsapp: "+91 (98765) 43210",
    visible: false,
    going: true,
  });
  assert.equal(result.email, "student@example.com");
  assert.equal(result.name, "Student");
  assert.equal(result.whatsapp, "919876543210");
  assert.equal(result.visible, false);
  assert.equal(
    registrationSchema.safeParse({
      ...result,
      departure: "27:30",
      whatsapp: "",
    }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({ ...result, departure: "", whatsapp: "abc" })
      .success,
    false,
  );
  assert.equal(
    centreSchema.safeParse({ name: "   ", address: "Address" }).success,
    false,
  );
});
test("expired return statuses are excluded", () => {
  assert.equal(
    isReturning("2020-01-01T00:00:00Z", Date.parse("2020-01-01T02:00:00Z")),
    false,
  );
  assert.equal(
    isReturning("2020-01-01T03:00:00Z", Date.parse("2020-01-01T02:00:00Z")),
    true,
  );
  assert.equal(isReturning(null), false);
});
