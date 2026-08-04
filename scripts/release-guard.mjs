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
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  const main = spawnSync("git", ["rev-parse", "origin/main"], { cwd: ROOT, encoding: "utf8" });
  if (head.status !== 0 || main.status !== 0 || head.stdout.trim() !== main.stdout.trim()) {
    throw new Error("release tag must point to the exact origin/main tip");
  }
}

process.stdout.write(`release guard passed: ${tag}\n`);
