// Prepare a source-only payload for the already-created CentreMate Vercel project.
// No authentication material is read or included here.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const roots = ["app", "components", "lib", "supabase", "scripts", "tests"];
const names = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "components.json",
  ".gitignore",
  ".vercelignore",
  ".env.example",
  "README.md",
];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
  );
}
const files = [...names, ...roots.flatMap(walk)].sort();
const hash = createHash("sha256");
for (const path of files) hash.update(path + "\0").update(readFileSync(path));
const sourceHash = hash.digest("hex");
mkdirSync("public", { recursive: true });
writeFileSync("public/version.json", JSON.stringify({ sourceHash }) + "\n");
files.push("public/version.json");
const payload = {
  name: "centremate",
  project: "prj_FQICpl1AG2W5p3GTwZKt9eF8GjiV",
  target: "production",
  projectSettings: { framework: "nextjs" },
  meta: { sourceHash },
  files: files.map((file) => ({
    file,
    data: readFileSync(file).toString("base64"),
    encoding: "base64",
  })),
};
mkdirSync("scratch", { recursive: true });
writeFileSync("scratch/deployment.json", JSON.stringify(payload));
console.log(
  "Prepared " + files.length + " source files. SHA-256: " + sourceHash,
);
