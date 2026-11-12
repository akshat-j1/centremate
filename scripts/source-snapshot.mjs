import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
export function sourceSnapshot(root) {
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
    return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(
      (entry) =>
        entry.isDirectory()
          ? walk(dir + "/" + entry.name)
          : [dir + "/" + entry.name],
    );
  }
  const files = [...names, ...roots.flatMap(walk)].sort();
  const hash = createHash("sha256");
  for (const path of files)
    hash.update(path + "\0").update(readFileSync(resolve(root, path)));
  return { files, sourceHash: hash.digest("hex") };
}
