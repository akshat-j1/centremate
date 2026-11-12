import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkProductionHttp,
  assertHttpChecks,
} from "../scripts/production-health.mjs";
import { SUPABASE_REF } from "../scripts/infrastructure-safety.mjs";
const base = `https://${SUPABASE_REF}.supabase.co`,
  site = "https://centremate.example",
  anon = "sb_publishable_test";
function fetcher(broken = false) {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    let data: unknown = {};
    let status = 200;
    if (url.pathname === "/") {
      return new Response(
        '<h1>CentreMate</h1><script src="/_next/static/app.js"></script>',
        { status: 200 },
      );
    }
    if (url.pathname === "/_next/static/app.js")
      return new Response(broken ? "stale frontend" : base + " " + anon);
    if (url.pathname === "/version.json")
      data = { sourceHash: broken ? "old" : "current" };
    else if (url.pathname === "/auth/v1/settings")
      data = { external: { google: !broken } };
    else if (url.pathname === "/rest/v1/registrations") {
      status = 403;
      data = { message: "denied" };
    } else if (url.pathname.includes("/rpc/"))
      data = url.pathname.endsWith("is_approved")
        ? false
        : url.pathname.endsWith("contact")
          ? null
          : [];
    else if (url.pathname.startsWith("/rest/v1/")) {
      status = broken ? 503 : 200;
      data = [];
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}
test("functional HTTP checks cover actual database API, anonymous RPC privacy, OAuth settings and built client env", async () => {
  const result = await checkProductionHttp(
    { anon, site, sourceHash: "current" },
    fetcher(),
  );
  assert.doesNotThrow(() => assertHttpChecks(result));
  assert.equal(result.production_client_database_configured, true);
  assert.equal(result.anonymous_directory, true);
  assert.equal(result.database_exams_access, true);
});
test("a frontend loading alone does not pass production verification", async () => {
  const result = await checkProductionHttp(
    { anon, site, sourceHash: "current" },
    fetcher(true),
  );
  assert.equal(result.production_homepage, true);
  assert.equal(result.database_exams_access, false);
  assert.equal(result.google_provider_enabled, false);
  assert.equal(result.production_client_database_configured, false);
  assert.throws(
    () => assertHttpChecks(result),
    /Production HTTP verification failed/,
  );
});
