import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  requireProject,
  mergeEnvironment,
  existingEnvironment,
  productionSql,
  SUPABASE_REF,
  SUPABASE_ORG,
  SCHEMA_CHECKS,
  READINESS_CHECKS,
  readOnlyQueryArgs,
  assertChecks,
  parseProjectKeys,
  parseCliJson,
} from "../scripts/infrastructure-safety.mjs";
const url = `https://${SUPABASE_REF}.supabase.co`;
test("resume accepts only the pinned project and organization", () => {
  const good = {
    id: SUPABASE_REF,
    name: "centremate",
    organization_slug: SUPABASE_ORG,
  };
  assert.equal(requireProject([good]), good);
  for (const p of [
    { ...good, id: "zmaemtkhklnbtgpyepqn" },
    { ...good, id: "aaaaaaaaaaaaaaaaaaaa" },
    { ...good, organization_slug: "other" },
    { ...good, name: "other" },
  ])
    assert.throws(() => requireProject([p]), /pinned/);
  assert.throws(() => requireProject([]), /pinned/);
});
test("Vercel OIDC environment survives a resumable CentreMate merge", () => {
  const original = '# Vercel CLI\nVERCEL_OIDC_TOKEN="test-only-token"\n';
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key",
    FORM_SYNC_SECRET: "test-secret",
  };
  const merged = mergeEnvironment(original, values);
  assert.ok(merged.startsWith(original));
  assert.equal(
    existingEnvironment(merged).VERCEL_OIDC_TOKEN,
    "test-only-token",
  );
  assert.equal(existingEnvironment(merged).NEXT_PUBLIC_SUPABASE_URL, url);
  assert.equal(mergeEnvironment(merged, values), merged);
});
test("merging does not cross project boundaries or duplicate keys", () => {
  assert.throws(
    () =>
      mergeEnvironment(
        "NEXT_PUBLIC_SUPABASE_URL=https://unrelated.supabase.co\n",
        { NEXT_PUBLIC_SUPABASE_URL: url },
      ),
    /another project/,
  );
  const text = `NEXT_PUBLIC_SUPABASE_URL="${url}"\nFORM_SYNC_SECRET=original\nFORM_SYNC_SECRET=duplicate\n`;
  const result = mergeEnvironment(text, {
    NEXT_PUBLIC_SUPABASE_URL: url,
    FORM_SYNC_SECRET: "original",
  });
  assert.equal(result.match(/FORM_SYNC_SECRET=/g)?.length, 1);
  assert.equal(existingEnvironment(result).FORM_SYNC_SECRET, "original");
});
test("all production SQL is SELECT-only and rejects CLI-incompatible or mutating statements", () => {
  for (const path of [
    "tests/production-verification.sql",
    "tests/production-readiness.sql",
  ]) {
    const sql = readFileSync(path, "utf8");
    assert.equal(productionSql(sql), sql);
  }
  assert.throws(
    () => productionSql(readFileSync("tests/database.sql", "utf8")),
    /SELECT-only/,
  );
  for (const sql of [
    "BEGIN READ ONLY; SELECT 1; ROLLBACK;",
    "DO $$ BEGIN END $$;",
    "SET ROLE anon; SELECT 1;",
    "SELECT 1; COMMIT;",
    "WITH changed AS (DELETE FROM public.registrations RETURNING *) SELECT * FROM changed;",
    "SELECT set_config('role','anon',true);",
  ])
    assert.throws(() => productionSql(sql));
});

test("query command uses JSON without agent wrappers and cannot change target", () => {
  assert.deepEqual(
    readOnlyQueryArgs(SUPABASE_REF, "tests/production-verification.sql"),
    [
      "db",
      "query",
      "--remote=" + SUPABASE_REF,
      "--read-only",
      "--file",
      "tests/production-verification.sql",
      "-o",
      "json",
      "--agent=no",
    ],
  );
  assert.throws(
    () => readOnlyQueryArgs("zmaemtkhklnbtgpyepqn", "x.sql"),
    /another project/,
  );
});
test("verification fails on missing, false, string or duplicate results", () => {
  const good = SCHEMA_CHECKS.map((check_name) => ({
    check_name,
    passed: true,
  }));
  assert.equal(
    assertChecks(JSON.stringify(good), SCHEMA_CHECKS).length,
    SCHEMA_CHECKS.length,
  );
  for (const bad of [
    [],
    good.slice(1),
    good.map((r, i) => (i ? r : { ...r, passed: false })),
    good.map((r, i) => (i ? r : { ...r, passed: "true" })),
    [...good, { ...good[0], passed: false }],
  ])
    assert.throws(
      () => assertChecks(bad, SCHEMA_CHECKS),
      /Verification failed/,
    );
  assert.throws(
    () =>
      assertChecks(
        READINESS_CHECKS.map((check_name) => ({ check_name, passed: false })),
        READINESS_CHECKS,
      ),
    /google_student_registration_recorded/,
  );
});
test("API keys must belong to the requested project and use the correct roles", () => {
  const key = (role: string, ref = SUPABASE_REF) =>
    "test." +
    Buffer.from(JSON.stringify({ role, ref })).toString("base64url") +
    ".test";
  const anon = key("anon"),
    service = key("service_role");
  assert.deepEqual(
    parseProjectKeys([
      { name: "anon", api_key: anon },
      { name: "service_role", api_key: service },
    ]),
    { anon, service },
  );
  assert.throws(
    () => parseProjectKeys([{ name: "anon", api_key: service }]),
    /wrong role/,
  );
  assert.throws(
    () =>
      parseProjectKeys([{ name: "anon", api_key: key("anon", "unrelated") }]),
    /wrong role/,
  );
  assert.throws(
    () => parseProjectKeys([{ name: "anon", api_key: "...masked..." }]),
    /complete/,
  );
  assert.equal(
    parseProjectKeys([{ type: "publishable", api_key: "sb_publishable_test" }])
      .anon,
    "sb_publishable_test",
  );
});

test("CLI warnings before JSON do not hide a failed boolean or corrupt a valid result", () => {
  const warning = "│\n▲ Connected to isolated test database without TLS\n";
  const good = SCHEMA_CHECKS.map((check_name) => ({
    check_name,
    passed: true,
  }));
  assert.equal(
    assertChecks(warning + JSON.stringify(good), SCHEMA_CHECKS).length,
    SCHEMA_CHECKS.length,
  );
  assert.throws(
    () =>
      assertChecks(
        warning +
          JSON.stringify([{ check_name: SCHEMA_CHECKS[0], passed: false }]),
        SCHEMA_CHECKS,
      ),
    /Verification failed/,
  );
  assert.throws(() => parseCliJson("not JSON"), /complete JSON/);
});
