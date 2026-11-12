import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceSnapshot } from "../scripts/source-snapshot.mjs";
test("source manifests exclude CLI caches, nested environment files and symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "centremate-manifest-"));
  try {
    for (const dir of [
      "app",
      "components",
      "lib",
      "supabase",
      "scripts",
      "tests",
    ])
      mkdirSync(join(root, dir));
    for (const file of [
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
    ])
      writeFileSync(join(root, file), "");
    writeFileSync(
      join(root, "app/page.tsx"),
      "export default function Page(){}",
    );
    mkdirSync(join(root, "supabase/.temp"));
    writeFileSync(
      join(root, "supabase/.temp/project-ref"),
      "private project cache",
    );
    writeFileSync(join(root, "scripts/.env.local"), "SECRET=test-only");
    symlinkSync(
      join(root, "scripts/.env.local"),
      join(root, "app/linked-secret"),
    );
    const first = sourceSnapshot(root);
    assert.ok(first.files.includes("app/page.tsx"));
    assert.ok(
      !first.files.some(
        (file) =>
          file.includes(".temp") ||
          file.includes(".env.local") ||
          file.endsWith("linked-secret"),
      ),
    );
    writeFileSync(
      join(root, "supabase/.temp/project-ref"),
      "changed private cache",
    );
    assert.equal(sourceSnapshot(root).sourceHash, first.sourceHash);
    writeFileSync(join(root, "app/page.tsx"), "changed source");
    assert.notEqual(sourceSnapshot(root).sourceHash, first.sourceHash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("the actual deployment source list contains no linked-project cache", () => {
  const { files } = sourceSnapshot(process.cwd());
  assert.ok(
    !files.some(
      (file) =>
        file.startsWith("supabase/.temp/") || file.includes(".env.local"),
    ),
  );
});
