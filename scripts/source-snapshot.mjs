import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
      (entry) => {
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.name === "scratch"
        )
          return [];
        if (entry.isDirectory()) return walk(dir + "/" + entry.name);
        return entry.isFile() ? [dir + "/" + entry.name] : [];
      },
    );
  }
  const candidates = [...names, ...roots.flatMap(walk)].sort();
  const ignored = spawnSync(
    "git",
    ["check-ignore", "--no-index", "-z", "--stdin"],
    { cwd: root, input: candidates.join("\0") + "\0", encoding: "utf8" },
  );
  if (ignored.error) throw ignored.error;
  if (![0, 1, 128].includes(ignored.status))
    throw new Error("Could not check ignored source paths.");
  const privatePaths = new Set(
    ignored.status === 0 ? ignored.stdout.split("\0") : [],
  );
  const files = candidates.filter((path) => !privatePaths.has(path));
  const hash = createHash("sha256");
  for (const path of files)
    hash.update(path + "\0").update(readFileSync(resolve(root, path)));
  return { files, sourceHash: hash.digest("hex") };
}
