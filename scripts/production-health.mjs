import { SUPABASE_REF } from "./infrastructure-safety.mjs";
export async function checkProductionHttp(
  { anon, site, sourceHash },
  fetcher = fetch,
) {
  const base = `https://${SUPABASE_REF}.supabase.co`;
  const headers = {
    apikey: anon,
    Authorization: "Bearer " + anon,
    "Content-Type": "application/json",
  };
  /** @type {Record<string, boolean>} */
  const result = {};
  async function check(name, url, options, accept) {
    try {
      const response = await fetcher(url, {
        ...options,
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      result[name] = await accept(response);
    } catch {
      result[name] = false;
    }
  }
  await check(
    "database_exams_access",
    base + "/rest/v1/exams?select=id&limit=1",
    { headers },
    async (r) => r.ok && Array.isArray(await r.json()),
  );
  await check(
    "database_centres_access",
    base + "/rest/v1/centres?select=id&limit=1",
    { headers },
    async (r) => r.ok && Array.isArray(await r.json()),
  );
  await check(
    "anonymous_registrations_private",
    base + "/rest/v1/registrations?select=id&limit=1",
    { headers },
    async (r) =>
      [401, 403].includes(r.status) ||
      (r.ok && JSON.stringify(await r.json()) === "[]"),
  );
  for (const [rpc, args, expected] of [
    ["is_approved", {}, false],
    ["directory", { p_exam: null, p_centre: null }, []],
    ["centre_counts", { p_exam: null }, []],
    ["contact", { p_registration: null }, null],
  ]) {
    await check(
      "anonymous_" + rpc,
      base + "/rest/v1/rpc/" + rpc,
      { method: "POST", headers, body: JSON.stringify(args) },
      async (r) =>
        r.ok && JSON.stringify(await r.json()) === JSON.stringify(expected),
    );
  }
  await check(
    "google_provider_enabled",
    base + "/auth/v1/settings",
    { headers },
    async (r) => r.ok && (await r.json()).external?.google === true,
  );
  let html = "";
  await check("production_homepage", site, {}, async (r) => {
    html = await r.text();
    return r.ok && html.includes("CentreMate");
  });
  await check(
    "deployed_source_matches",
    site + "/version.json?verify=" + Date.now(),
    {},
    async (r) => r.ok && (await r.json()).sourceHash === sourceHash,
  );
  // Check the actual client bundle, because matching source alone does not prove NEXT_PUBLIC env was built.
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => new URL(m[1].replaceAll("&amp;", "&"), site))
    .filter(
      (url) =>
        url.origin === new URL(site).origin &&
        url.pathname.startsWith("/_next/"),
    );
  let bundle = "";
  for (const url of scripts) {
    try {
      const r = await fetcher(url.href, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) bundle += await r.text();
    } catch {}
  }
  result.production_client_database_configured =
    bundle.includes(base) && bundle.includes(anon);
  return result;
}
export function assertHttpChecks(checks) {
  const failed = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  if (failed.length)
    throw new Error(
      "Production HTTP verification failed: " + failed.join(", "),
    );
}
