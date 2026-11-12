// Own disposable PostgreSQL only. This runner accepts no database URL or project ref.
import {
  assertChecks,
  SCHEMA_CHECKS,
  productionSql,
} from "./infrastructure-safety.mjs";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const container = "centremate-rls-test-" + randomBytes(6).toString("hex");
function docker(args, quiet = false) {
  const r = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error(
      "Isolated PostgreSQL test failed: docker " +
        args[0] +
        (r.stderr ? "\n" + r.stderr.trim() : ""),
    );
  return r;
}
const staging = mkdtempSync(join(tmpdir(), "centremate-sql-"));
writeFileSync(
  join(staging, "migration.sql"),
  readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) =>
      readFileSync(resolve(root, "supabase/migrations", name), "utf8"),
    )
    .join("\n"),
);
const verification = productionSql(
  readFileSync(resolve(root, "tests/production-verification.sql"), "utf8"),
)
  .trim()
  .replace(/;$/, "");
writeFileSync(
  join(staging, "verify.json.sql"),
  "select json_agg(checks) from (\n" + verification + "\n) checks;",
);
let owned = false;
try {
  docker(
    [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:17-alpine",
    ],
    true,
  );
  owned = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    );
    if (r.status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Isolated PostgreSQL did not become ready.");
  docker([
    "exec",
    container,
    "createdb",
    "-U",
    "postgres",
    "centremate_isolated_tests",
  ]);
  for (const [local, remote] of [
    [join(staging, "migration.sql"), "migration.sql"],
    ["tests/database.sql", "database.sql"],
    ["tests/isolated-bootstrap.sql", "isolated-bootstrap.sql"],
    [join(staging, "verify.json.sql"), "verify.json.sql"],
  ])
    docker(["cp", resolve(root, local), container + ":/tmp/" + remote]);
  docker([
    "exec",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "centremate_isolated_tests",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "/tmp/database.sql",
  ]);
  docker([
    "exec",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "centremate_isolated_tests",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "/tmp/isolated-bootstrap.sql",
    "-f",
    "/tmp/migration.sql",
  ]);
  const output = docker(
    [
      "exec",
      "-e",
      "PGOPTIONS=-c default_transaction_read_only=on",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "centremate_isolated_tests",
      "-v",
      "ON_ERROR_STOP=1",
      "-A",
      "-t",
      "-f",
      "/tmp/verify.json.sql",
    ],
    true,
  ).stdout;
  assertChecks(output, SCHEMA_CHECKS);
  console.log(
    "Isolated RLS suite and read-only verification SQL passed. No hosted project was contacted.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(staging, { recursive: true, force: true });
  if (owned) spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
