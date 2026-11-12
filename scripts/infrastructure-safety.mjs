export const SUPABASE_REF = "clnwwhadsalezsdmamsf";
export const SUPABASE_ORG = "wlvfxeuxgdybfxthizwy";
export const VERCEL_PROJECT = "prj_FQICpl1AG2W5p3GTwZKt9eF8GjiV";
export function requireProject(list) {
  const project = list.find((p) => p.id === SUPABASE_REF);
  if (
    !project ||
    project.name !== "centremate" ||
    ![project.organization_id, project.organization_slug].includes(SUPABASE_ORG)
  )
    throw new Error(
      "The pinned CentreMate project was not found in the expected organization. No project will be created or substituted.",
    );
  return project;
}
export function mergeEnvironment(text, values) {
  const url = text
    .match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)$/m)?.[1]
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  if (url && url !== values.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error(
      ".env.local points to another project; refusing to overwrite it.",
    );
  const remaining = { ...values };
  const lines = text
    .split("\n")
    .map((line) => {
      const key = line.match(/^([A-Z_]+)\s*=/)?.[1];
      if (!key || !(key in values)) return line;
      if (!(key in remaining)) return null; // Remove duplicate CentreMate keys only.
      delete remaining[key];
      return `${key}=${values[key]}`;
    })
    .filter((line) => line !== null);
  while (lines.at(-1) === "") lines.pop();
  return [
    ...lines,
    ...Object.entries(remaining).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
}
export function existingEnvironment(text) {
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [
        match[1],
        match[2].trim().replace(/^(['"])(.*)\1$/, "$2"),
      ]),
  );
}
export const SCHEMA_CHECKS = [
  "tables_and_rls",
  "required_policies",
  "required_functions",
  "student_exam_unique",
  "private_by_default",
  "directory_projection_private",
  "anonymous_tables_denied",
  "anonymous_import_denied",
  "anonymous_return_write_denied",
  "move_and_deletion_triggers",
];
export const READINESS_CHECKS = [
  "google_sign_in_recorded",
  "google_student_registration_recorded",
  "administrator_configured",
];
export function productionSql(text) {
  // Deliberately narrow: one SELECT/WITH statement. CLI --read-only owns the transaction.
  const stripped = text
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(stripped))
    throw new Error(
      "Production verification must contain a SELECT-only read-only query.",
    );
  if (
    /\b(begin|commit|rollback|start|savepoint|release|do|set|reset|insert|update|delete|truncate|grant|revoke|create|alter|drop|merge|copy|execute|call|into)\b/i.test(
      stripped,
    )
  )
    throw new Error(
      "Transaction control, procedural SQL and mutations are forbidden in read-only verification.",
    );
  const statements = stripped.split(";").filter((part) => part.trim());
  if (statements.length !== 1)
    throw new Error(
      "Production verification must be a single SELECT-only statement.",
    );
  if (
    /\b(set_config|pg_advisory_lock|pg_sleep|dblink_exec|lo_import|lo_export)\s*\(/i.test(
      stripped,
    )
  )
    throw new Error(
      "Side-effect functions are forbidden in production verification.",
    );
  return text;
}
export function readOnlyQueryArgs(ref, file) {
  if (ref !== SUPABASE_REF)
    throw new Error("Refusing query against another project.");
  return [
    "db",
    "query",
    `--remote=${ref}`,
    "--read-only",
    "--file",
    file,
    "-o",
    "json",
    "--agent=no",
  ];
}
export function parseCliJson(output) {
  if (typeof output !== "string") return output;
  const text = output.trim();
  try {
    return JSON.parse(text);
  } catch {}
  // CLI 3.1 may emit a connection warning before JSON even with -o json.
  // Require a complete JSON suffix; never coerce table text or booleans.
  for (const match of text.matchAll(/^[ \t]*(?=[\[{])/gm)) {
    try {
      return JSON.parse(text.slice(match.index).trim());
    } catch {}
  }
  throw new Error(
    "The CLI did not return a complete JSON result. Verification did not pass.",
  );
}
export function queryRows(output) {
  const value = parseCliJson(output);
  const rows = Array.isArray(value)
    ? value
    : (value?.data?.rows ?? value?.rows ?? value?.data);
  if (!Array.isArray(rows))
    throw new Error(
      "Unrecognized Supabase query JSON; verification did not pass.",
    );
  return rows;
}
export function assertChecks(output, expected) {
  const rows = queryRows(output);
  const missing = expected.filter((name) => {
    const matching = rows.filter((row) => row.check_name === name);
    return matching.length !== 1 || matching[0].passed !== true;
  });
  if (missing.length)
    throw new Error("Verification failed: " + missing.join(", "));
  return rows;
}

export function parseProjectKeys(value) {
  const list = Array.isArray(value)
    ? value
    : (value?.keys ?? value?.data?.keys);
  if (!Array.isArray(list))
    throw new Error("Unrecognized project API-key output.");
  const publicKey =
    list.find((k) => k.name === "anon") ??
    list.find((k) => k.type === "publishable");
  const serviceKey =
    list.find((k) => k.name === "service_role") ??
    list.find((k) => k.type === "secret");
  const check = (key, role, opaquePrefix) => {
    if (!key || key.includes("...") || key.includes("…"))
      throw new Error("A complete project API key is required.");
    if (key.startsWith(opaquePrefix)) return key;
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (
        payload.role !== role ||
        (payload.ref && payload.ref !== SUPABASE_REF)
      )
        throw new Error("wrong key");
      return key;
    } catch {
      throw new Error(
        "An API key has the wrong role or project. No credential value was printed.",
      );
    }
  };
  const anon = check(publicKey?.api_key, "anon", "sb_publishable_");
  const service =
    serviceKey?.api_key && !serviceKey.api_key.includes("...")
      ? check(serviceKey.api_key, "service_role", "sb_secret_")
      : undefined;
  return { anon, service };
}
