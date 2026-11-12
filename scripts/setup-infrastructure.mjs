/** Run in the user's authenticated Mac Terminal, never in an unauthenticated sandbox. */
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const ORG = "wlvfxeuxgdybfxthizwy",
  FORBIDDEN = "zmaemtkhklnbtgpyepqn",
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
  return JSON.parse(run(bin, args, { capture: true }));
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
  const matches = projects().filter(
    (p) =>
      p.name === "centremate" &&
      (p.organization_id === ORG || p.organization_slug === ORG),
  );
  if (matches.length > 1)
    throw new Error(
      "Multiple CentreMate projects found. Resolve the duplicate before continuing.",
    );
  const p = matches[0];
  if (p && (p.id === FORBIDDEN || !/^[a-z]{20}$/.test(p.id)))
    throw new Error("Unsafe project ref; refusing all operations.");
  return p;
}
function verifiedRef() {
  const p = project();
  if (!p)
    throw new Error(
      "Create CentreMate first by running this script without flags.",
    );
  return p.id;
}
async function ask(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}
function secret(prompt) {
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
  if (!existsSync(".git")) run("git", ["init", "-b", "main"]);
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
  const user = json("gh", ["api", "user"]);
  if (user.login !== "akshat-j1")
    throw new Error("GitHub CLI must be authenticated as akshat-j1.");
  for (const [key, value] of [
    ["user.name", user.name || user.login],
    ["user.email", `${user.id}+${user.login}@users.noreply.github.com`],
  ]) {
    const current = spawnSync("git", ["config", key], { encoding: "utf8" });
    if (!current.stdout.trim()) run("git", ["config", key, value]);
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
  // Distinguish absence from authentication or network failure.
  const lookup = spawnSync("gh", ["api", `repos/${REPO}`], {
    env,
    encoding: "utf8",
  });
  let repository;
  try {
    repository = JSON.parse(lookup.stdout);
  } catch {
    throw new Error(
      "GitHub repository lookup failed. Check CLI authentication/network.",
    );
  }
  if (lookup.status !== 0) {
    if (
      repository.message !== "Not Found" ||
      !lookup.stderr.includes("HTTP 404")
    )
      throw new Error(
        "GitHub lookup failed; refusing to interpret it as a missing repository.",
      );
    if (origin.status !== 0)
      run("gh", [
        "repo",
        "create",
        REPO,
        "--private",
        "--source=.",
        "--remote=origin",
      ]);
    else run("gh", ["repo", "create", REPO, "--private"]);
  } else {
    if (repository.full_name !== REPO)
      throw new Error("Unexpected GitHub repository returned.");
    if (origin.status !== 0)
      run("git", ["remote", "add", "origin", `https://github.com/${REPO}.git`]);
  }
  run("git", ["push", "--set-upstream", "origin", "main"]);
}
function linkVercel() {
  run("vercel", ["link", "--yes", "--scope", TEAM, "--project", PROJECT]);
  const linked = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  if (linked.projectId !== PROJECT)
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
  const list = Array.isArray(result)
    ? result
    : (result.keys ?? result.data?.keys);
  if (!Array.isArray(list))
    throw new Error("Unrecognized API key output. No keys were printed.");
  const anon =
    list.find((k) => k.name === "anon") ??
    list.find((k) => k.type === "publishable");
  const service =
    list.find((k) => k.name === "service_role") ??
    list.find((k) => k.type === "secret");
  if (!anon?.api_key || anon.api_key.includes("..."))
    throw new Error("A complete public API key is required.");
  return { anon: anon.api_key, service: service?.api_key };
}
function smoke(ref) {
  // Reuse the actual RLS assertions, replacing only the isolated test database bootstrap.
  const local = readFileSync("tests/database.sql", "utf8");
  const body = local.slice(local.indexOf("create function public.assert"));
  if (body.includes("\\i") || !body.trim().endsWith("rollback;"))
    throw new Error("Unsafe smoke test source.");
  writeFileSync(
    "scratch/live-database-test.sql",
    "begin;\n-- Broader temporary grants ensure RLS withstands direct table privileges. Rolled back.\ngrant all on all tables in schema public to anon,authenticated;\n" +
      body,
  );
  run("supabase", [
    "db",
    "query",
    `--remote=${ref}`,
    "--file",
    "scratch/live-database-test.sql",
    "--yes",
  ]);
  console.log(
    "Live PostgreSQL transaction completed: 27 authorization/privacy/deduplication assertions; all fixtures rolled back.",
  );
}
async function verify(ref) {
  smoke(ref);
  const { anon } = keys(ref);
  const headers = { apikey: anon };
  const settings = await fetch(`https://${ref}.supabase.co/auth/v1/settings`, {
    headers,
  });
  if (!settings.ok) throw new Error("Supabase Auth settings request failed.");
  const auth = await settings.json();
  if (auth.external?.google !== true)
    throw new Error(
      "Google provider is not enabled. Run this script with --auth.",
    );
  console.log("Google provider enabled: true");
  const response = await fetch(
    `https://${ref}.supabase.co/rest/v1/registrations?select=email,whatsapp`,
    { headers },
  );
  if (response.ok) {
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length)
      throw new Error("Anonymous privacy check failed.");
  } else if (![401, 403].includes(response.status))
    throw new Error("Unexpected anonymous API response: " + response.status);
  console.log("Live anonymous API: student emails and contacts inaccessible.");
  run("supabase", [
    "db",
    "query",
    `--remote=${ref}`,
    "--read-only",
    "do $$ begin if not exists(select 1 from auth.users u where u.last_sign_in_at is not null and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')) then raise exception 'No real Google sign-in recorded. Complete Google login on production first.'; end if; end $$;",
  ]);
  const head = run("git", ["rev-parse", "HEAD"], { capture: true });
  const remote = run(
    "gh",
    ["api", `repos/${REPO}/git/ref/heads/main`, "--jq", ".object.sha"],
    { capture: true },
  );
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
  const live = await fetch(SITE + "/version.json?verify=" + Date.now(), {
    cache: "no-store",
  });
  if (!live.ok || (await live.json()).sourceHash !== local.sourceHash)
    throw new Error("Production source hash differs from local/GitHub source.");
  console.log(
    "Verified: live RLS tests, anonymous privacy, real Google sign-in record, local HEAD = GitHub main, production source hash matches.",
  );
  console.log(
    "Also confirm that Google login returns to the production page with your signed-in account before inviting students.",
  );
}
try {
  if (!process.stdin.isTTY)
    throw new Error(
      "Run this in your Mac Terminal so existing keychain credentials and hidden prompts are accessible.",
    );
  const mode = process.argv[2];
  if (mode === "--auth") {
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
    run("vercel", [
      "git",
      "connect",
      `https://github.com/${REPO}.git`,
      "--yes",
      "--scope",
      TEAM,
      "--project",
      PROJECT,
    ]);
    run("vercel", ["deploy", "--prod", "--yes", "--scope", TEAM]);
    console.log(
      `OAuth configured. Open ${SITE}, complete Google login, then run: node scripts/setup-infrastructure.mjs --verify`,
    );
  } else if (mode === "--verify") {
    await verify(verifiedRef());
  } else if (mode) {
    throw new Error(
      "Supported flags: --auth, --verify, or no flag for provisioning.",
    );
  } else {
    if (
      run("gh", ["api", "user", "--jq", ".login"], { capture: true }) !==
      "akshat-j1"
    )
      throw new Error("Authenticate GitHub CLI as akshat-j1 first.");
    gitPublish();
    linkVercel();
    run("vercel", [
      "git",
      "connect",
      `https://github.com/${REPO}.git`,
      "--yes",
      "--scope",
      TEAM,
      "--project",
      PROJECT,
    ]);
    let p = project();
    if (!p) {
      if (existsSync("scratch/centremate-create-pending"))
        throw new Error(
          "A prior creation attempt has an uncertain outcome. Check the Supabase organization dashboard before deleting scratch/centremate-create-pending and retrying. No duplicate creation attempted.",
        );
      console.log(
        "Confirm the requested organization is on Free in its Supabase Billing dashboard. The API inherits the organization plan.",
      );
      if (
        (await ask(
          "Type FREE only after verifying the organization plan: ",
        )) !== "FREE"
      )
        throw new Error(
          "Free plan is not confirmed; no Supabase project was created.",
        );
      console.log(
        "Creating only centremate in the specified organization, default compute, no upgrades or paid options. If Free quota is exhausted, stop; do not upgrade or pause other projects.",
      );
      writeFileSync(
        "scratch/centremate-create-pending",
        new Date().toISOString(),
      );
      run("supabase", [
        "projects",
        "create",
        "centremate",
        "--org-id",
        ORG,
        "--region",
        "ap-south-1",
      ]);
      p = project();
      if (!p)
        throw new Error(
          "Project creation has not appeared in the organization. Check Supabase before retrying; do not create duplicates.",
        );
    }
    const ref = p.id;
    if (existsSync("scratch/centremate-create-pending"))
      unlinkSync("scratch/centremate-create-pending");
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
    smoke(ref);
    const k = keys(ref);
    const values = {
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: k.anon,
      NEXT_PUBLIC_SITE_URL: SITE,
    };
    if (existsSync(".env.local")) {
      const previous = Object.fromEntries(
        readFileSync(".env.local", "utf8")
          .split("\n")
          .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
          .filter(Boolean)
          .map((match) => [match[1], match[2]]),
      );
      if (previous.NEXT_PUBLIC_SUPABASE_URL !== values.NEXT_PUBLIC_SUPABASE_URL)
        throw new Error(
          ".env.local points to another project; refusing to overwrite it.",
        );
      for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "FORM_SYNC_SECRET"])
        if (previous[key]) values[key] = previous[key];
    }
    if (
      k.service &&
      !k.service.includes("...") &&
      !values.SUPABASE_SERVICE_ROLE_KEY
    )
      values.SUPABASE_SERVICE_ROLE_KEY = k.service;
    if (values.SUPABASE_SERVICE_ROLE_KEY && !values.FORM_SYNC_SECRET)
      values.FORM_SYNC_SECRET = randomBytes(32).toString("hex");
    if (!existsSync(".env.local"))
      writeFileSync(
        ".env.local",
        Object.entries(values)
          .map(([n, v]) => `${n}=${v}`)
          .join("\n") + "\n",
        { mode: 0o600 },
      );
    linkVercel();
    for (const [name, value] of Object.entries(values)) envVercel(name, value);
    run("npm", ["test"]);
    run("npm", ["run", "typecheck"]);
    run("npm", ["run", "lint"]);
    run("npm", ["run", "build"]);
    run("node", ["scripts/prepare-deployment.mjs"]);
    gitPublish();
    run("vercel", [
      "git",
      "connect",
      `https://github.com/${REPO}.git`,
      "--yes",
      "--scope",
      TEAM,
      "--project",
      PROJECT,
    ]);
    run("vercel", ["deploy", "--prod", "--yes", "--scope", TEAM]);
    console.log(
      `Database, environment and repository configured. Google login remains incomplete until --auth is run.\nNext: node scripts/setup-infrastructure.mjs --auth\nGoogle callback: https://${ref}.supabase.co/auth/v1/callback\nRepository: https://github.com/${REPO}`,
    );
  }
} catch (error) {
  console.error("\nBLOCKED:", error.message);
  console.error(
    "Do not treat the launch as complete. Fix this specific step and rerun; never upgrade plans or target another project.",
  );
  process.exitCode = 1;
}
