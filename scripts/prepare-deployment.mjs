// Prepare a source-only payload for the already-created CentreMate Vercel project.
// No authentication material is read or included here.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { sourceSnapshot } from "./source-snapshot.mjs";
const { files, sourceHash } = sourceSnapshot(process.cwd());
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
