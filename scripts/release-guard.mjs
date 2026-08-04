import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const expected = `v${packageJson.version}`;

if (manifest.version !== packageJson.version) {
  throw new Error(`manifest version ${manifest.version} does not match package version ${packageJson.version}`);
}
if (tag !== expected) {
  throw new Error(`release tag ${tag ?? "<missing>"} does not match ${expected}`);
}
if (process.env.GITHUB_ACTIONS === "true") {
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd: ROOT });
  if (ancestor.status !== 0) throw new Error("release tag commit is not contained in origin/main");
}

process.stdout.write(`release guard passed: ${tag}\n`);
