/** Run in the user's authenticated Mac Terminal, never in an unauthenticated sandbox. */
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { checkProductionHttp, assertHttpChecks } from "./production-health.mjs";
import { sourceSnapshot } from "./source-snapshot.mjs";
import { randomBytes } from "node:crypto";
import {
  requireProject,
  existingEnvironment,
  mergeEnvironment,
  productionSql,
  SCHEMA_CHECKS,
  READINESS_CHECKS,
  readOnlyQueryArgs,
  assertChecks,
  parseProjectKeys,
  parseCliJson,
} from "./infrastructure-safety.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const ORG = "wlvfxeuxgdybfxthizwy",
  PROJECT = "prj_FQICpl1AG2W5p3GTwZKt9eF8GjiV",
  TEAM = "akshat-9076",
  REPO = "akshat-j1/centremate",
  SITE = "https://centremate-akshat-9076.vercel.app";
const env = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "1",
  VERCEL_TELEMETRY_DISABLED: "1",
};
mkdirSync("scratch", { recursive: true });
function run(bin, args, { capture = false, input, extraEnv = {} } = {}) {
  const result = spawnSync(bin, args, {
    cwd: root,
    env: { ...env, ...extraEnv },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: [
      input === undefined ? "inherit" : "pipe",
      capture ? "pipe" : "inherit",
      "inherit",
    ],
    input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${bin} ${args.slice(0, 2).join(" ")} failed (exit ${result.status}). Nothing was silently skipped.`,
    );
  return result.stdout?.trim() ?? "";
}
function json(bin, args) {
  return parseCliJson(run(bin, args, { capture: true }));
}
function projects() {
  const result = json("supabase", ["projects", "list", "-o", "json"]);
  const list = Array.isArray(result)
    ? result
    : (result.projects ?? result.data?.projects ?? result.data);
  if (!Array.isArray(list))
    throw new Error(
      "Unrecognized Supabase project-list format. Stop and share the nonsecret error.",
    );
  return list;
}
function project() {
  return requireProject(projects());
}
function verifiedRef() {
  return project().id;
}
async function ask(prompt) {
  if (!process.stdin.isTTY)
    throw new Error(
      "Interactive input is required for " +
        prompt +
        " Use an authenticated Terminal for this step.",
    );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}
function secret(prompt) {
  if (!process.stdin.isTTY)
    throw new Error(
      "Google OAuth secret entry requires an interactive Terminal.",
    );
  process.stderr.write(prompt);
  const result = spawnSync(
    "/bin/zsh",
    ["-c", 'read -rs centremate_input; print -r -- "$centremate_input"'],
    { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" },
  );
  process.stderr.write("\n");
  if (result.status !== 0) throw new Error("Secret entry cancelled.");
  return result.stdout.trim();
}
function config(google = false) {
  writeFileSync(
    "supabase/config.toml",
    `project_id = "centremate"\n\n[auth]\nenabled = true\nsite_url = "${SITE}"\nadditional_redirect_urls = ["${SITE}/auth/callback", "http://localhost:3000/auth/callback"]\n${google ? '\n[auth.external.google]\nenabled = true\nclient_id = "env(CENTREMATE_GOOGLE_CLIENT_ID)"\nsecret = "env(CENTREMATE_GOOGLE_CLIENT_SECRET)"\nskip_nonce_check = false\n' : ""}`,
  );
}
function gitPublish() {
  if (!existsSync(".git"))
    throw new Error(
      "Existing CentreMate Git checkout not found; refusing to initialize a replacement.",
    );
  const branch = run("git", ["branch", "--show-current"], { capture: true });
  if (branch !== "main")
    throw new Error(
      "This checkout must be on main; refusing to switch an existing branch automatically.",
    );
  const origin = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (
    origin.status === 0 &&
    !/^((https:\/\/github\.com\/)|(git@github\.com:))akshat-j1\/centremate(\.git)?\s*$/.test(
      origin.stdout,
    )
  )
    throw new Error(
      "Origin points to an unrelated repository; refusing to modify it.",
    );
  // The configured Git credential helper is sufficient; do not require a second gh login.
  run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"], {
    capture: true,
  });
  for (const [key, value] of [
    ["user.name", "akshat-j1"],
    ["user.email", "akshat-j1@users.noreply.github.com"],
  ]) {
    const current = spawnSync("git", ["config", key], { encoding: "utf8" });
    if (!current.stdout?.trim()) run("git", ["config", key, value]);
  }
  run("git", ["add", "."]);
  const staged = run("git", ["diff", "--cached", "--name-only"], {
    capture: true,
  }).split("\n");
  if (
    staged.some(
      (p) =>
        p.startsWith("scratch/") ||
        p.startsWith(".vercel/") ||
        /(^|\/)\.env(?!\.example$)/.test(p),
    )
  )
    throw new Error("A private file is staged. Remove it before committing.");
  if (staged.some(Boolean))
    run("git", [
      "commit",
      "-m",
      "Configure CentreMate infrastructure and verified deployment",
    ]);
  run("git", ["push", "--set-upstream", "origin", "main"]);
}
function linkVercel() {
  run("vercel", ["link", "--yes", "--scope", TEAM, "--project", PROJECT]);
  const linked = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  if (
    linked.projectId !== PROJECT ||
    linked.orgId !== "team_I14OK6NK4x7TA6VN1qJ39Gjl"
  )
    throw new Error("Vercel linked the wrong project. Refusing deployment.");
}
function envVercel(name, value) {
  run(
    "vercel",
    [
      "env",
      "add",
      name,
      "--environment",
      "production",
      "--force",
      "--yes",
      "--sensitive",
      "--scope",
      TEAM,
      "--project",
      PROJECT,
    ],
    { input: value + "\n" },
  );
}
function keys(ref) {
  const result = json("supabase", [
    "projects",
    "api-keys",
    `--remote=${ref}`,
    "--reveal",
    "-o",
    "json",
  ]);
  return parseProjectKeys(result);
}
function smoke(ref) {
  if (ref !== "clnwwhadsalezsdmamsf")
    throw new Error(
      "Refusing verification against a different Supabase project.",
    );
  productionSql(readFileSync("tests/production-verification.sql", "utf8"));
  const output = run(
    "supabase",
    readOnlyQueryArgs(ref, "tests/production-verification.sql"),
    { capture: true },
  );
  assertChecks(output, SCHEMA_CHECKS);
  console.log(
    "Production schema and privilege checks passed. No transaction statements or production fixtures were sent.",
  );
}
function isolatedTests() {
  run("node", ["scripts/test-database.mjs"]);
}
async function verify(ref) {
  smoke(ref);
  const { anon } = keys(ref);
  const { sourceHash } = sourceSnapshot(root);
  const http = await checkProductionHttp({ anon, site: SITE, sourceHash });
  for (const [name, passed] of Object.entries(http))
    console.log(`${passed ? "PASS" : "BLOCKED"}: ${name}`);
  assertHttpChecks(http);
  productionSql(readFileSync("tests/production-readiness.sql", "utf8"));
  const readiness = run(
    "supabase",
    readOnlyQueryArgs(ref, "tests/production-readiness.sql"),
    { capture: true },
  );
  assertChecks(readiness, READINESS_CHECKS);
  const head = run("git", ["rev-parse", "HEAD"], { capture: true });
  const remote = run(
    "git",
    ["ls-remote", "--exit-code", "origin", "refs/heads/main"],
    { capture: true },
  ).split(/\s+/)[0];
  if (head !== remote) throw new Error("Local HEAD differs from GitHub main.");
  const tracked = run(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { capture: true },
  );
  if (tracked)
    throw new Error(
      "Tracked local changes remain; commit, push and deploy them before verifying.",
    );
  const local = JSON.parse(readFileSync("public/version.json", "utf8"));
  if (local.sourceHash !== sourceHash)
    throw new Error(
      "The local source manifest is stale; source and deployment are not verified.",
    );
  console.log(
    "Verified: live database API and privacy checks, production client configuration, real Google sign-in and website registration records, local HEAD = GitHub main, deployed source matches current code.",
  );
  console.log(
    "Also confirm that Google login returns to the production page with your signed-in account before inviting students.",
  );
}
try {
  const mode = process.argv[2];
  if (mode === "--auth") {
    const local = existsSync(".env.local")
      ? existingEnvironment(readFileSync(".env.local", "utf8"))
      : {};
    if (
      local.NEXT_PUBLIC_SUPABASE_URL !==
        "https://clnwwhadsalezsdmamsf.supabase.co" ||
      !local.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      throw new Error(
        "Production database environment is not prepared. Complete environment setup before the OAuth/deployment phase.",
      );
    const ref = verifiedRef();
    console.log(
      `Google Cloud OAuth Web client callback: https://${ref}.supabase.co/auth/v1/callback`,
    );
    console.log(
      "Create/configure that OAuth client in Google Cloud first. For a testing OAuth app, add the student/admin test accounts.",
    );
    const clientId = await ask("Google OAuth client ID: ");
    const clientSecret = secret("Google OAuth client secret (hidden): ");
    if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret)
      throw new Error("Valid Google OAuth credentials are required.");
    config(true);
    run("supabase", ["config", "push", `--remote=${ref}`, "--yes"], {
      extraEnv: {
        CENTREMATE_GOOGLE_CLIENT_ID: clientId,
        CENTREMATE_GOOGLE_CLIENT_SECRET: clientSecret,
      },
    });
    run("node", ["scripts/prepare-deployment.mjs"]);
    gitPublish();
    linkVercel();
    run("vercel", ["deploy", "--prod", "--yes", "--scope", TEAM]);
    console.log(
      `OAuth configured. Open ${SITE}, complete Google login, then run: node scripts/setup-infrastructure.mjs --verify`,
    );
    await verify(ref);
  } else if (mode === "--verify") {
    await verify(verifiedRef());
  } else if (mode && mode !== "--resume") {
    throw new Error(
      "Supported flags: --resume, --auth, or --verify. No replacement resources are created.",
    );
  } else {
    const ref = verifiedRef();
    isolatedTests();
    linkVercel();
    writeFileSync(
      "scratch/infrastructure.json",
      JSON.stringify(
        {
          supabaseProjectRef: ref,
          supabaseOrganization: ORG,
          vercelProjectId: PROJECT,
          github: REPO,
        },
        null,
        2,
      ),
    );
    console.log(
      `Confirmed separate CentreMate project: ${ref}. Forbidden project is never targeted.`,
    );
    run("supabase", ["link", "--project-ref", ref]);
    if (!existsSync("supabase/config.toml")) config(false);
    run("supabase", ["db", "push", `--remote=${ref}`, "--yes", "--skip-vault"]);
    if (
      !readFileSync("supabase/config.toml", "utf8").includes(
        "[auth.external.google]",
      )
    )
      run("supabase", ["config", "push", `--remote=${ref}`, "--yes"]);
    const bootstrap = "scratch/bootstrap-admin.sql";
    const bootstrapIsSafe =
      existsSync(bootstrap) &&
      /insert into public\.admins\(email\)/.test(
        readFileSync(bootstrap, "utf8"),
      ) &&
      readFileSync(bootstrap, "utf8")
        .split("\n")
        .filter(Boolean)
        .every((line) =>
          /^insert into public\.(admins\(email\)|allowed_domains\(domain\)) values \('[a-z0-9@._+\-]+'\) on conflict do nothing;$/.test(
            line,
          ),
        );
    if (bootstrapIsSafe) {
      console.log(
        "Reusing the existing idempotent admin/domain bootstrap; no users or permissions are removed.",
      );
      run("supabase", [
        "db",
        "query",
        `--remote=${ref}`,
        "--file",
        bootstrap,
        "--yes",
      ]);
    } else {
      const admin = (
        await ask("Initial admin Google email (lowercase): ")
      ).toLowerCase();
      const domains = (
        await ask(
          "Approved exact Scaler domains, comma-separated (blank keeps directory closed to students): ",
        )
      )
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (
        !/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(admin) ||
        domains.some((d) => !/^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$/.test(d))
      )
        throw new Error("Invalid email or domain.");
      const sql =
        `insert into public.admins(email) values ('${admin}') on conflict do nothing;\n` +
        domains
          .map(
            (d) =>
              `insert into public.allowed_domains(domain) values ('${d}') on conflict do nothing;`,
          )
          .join("\n");
      writeFileSync("scratch/bootstrap-admin.sql", sql, { mode: 0o600 });
      run("supabase", [
        "db",
        "query",
        `--remote=${ref}`,
        "--file",
        "scratch/bootstrap-admin.sql",
        "--yes",
      ]);
    }
    smoke(ref);
    const k = keys(ref);
    const values = {
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: k.anon,
      NEXT_PUBLIC_SITE_URL: SITE,
    };
    const previousText = existsSync(".env.local")
      ? readFileSync(".env.local", "utf8")
      : "";
    const previous = existingEnvironment(previousText);
    if (previous.FORM_SYNC_SECRET)
      values.FORM_SYNC_SECRET = previous.FORM_SYNC_SECRET;
    if (
      k.service &&
      !k.service.includes("...") &&
      !values.SUPABASE_SERVICE_ROLE_KEY
    )
      values.SUPABASE_SERVICE_ROLE_KEY = k.service;
    if (values.SUPABASE_SERVICE_ROLE_KEY && !values.FORM_SYNC_SECRET)
      values.FORM_SYNC_SECRET = randomBytes(32).toString("hex");
    const merged = mergeEnvironment(previousText, values);
    writeFileSync(".env.local", merged, { mode: 0o600 });
    chmodSync(".env.local", 0o600);
    linkVercel();
    for (const [name, value] of Object.entries(values)) envVercel(name, value);
    run("npm", ["test"]);
    run("npm", ["run", "typecheck"]);
    run("npm", ["run", "lint"]);
    run("npm", ["run", "build", "--", "--webpack"]);
    run("node", ["scripts/prepare-deployment.mjs"]);
    gitPublish();
    run("vercel", ["deploy", "--prod", "--yes", "--scope", TEAM]);
    console.log(
      `Environment and code deployed to the existing project. Functional production readiness is checked next; deployment alone does not pass. Google callback: https://${ref}.supabase.co/auth/v1/callback`,
    );
    await verify(ref);
  }
} catch (error) {
  console.error("\nBLOCKED:", error.message);
  console.error(
    "Do not treat the launch as complete. Fix this specific step and rerun; never upgrade plans or target another project.",
  );
  process.exitCode = 1;
}
