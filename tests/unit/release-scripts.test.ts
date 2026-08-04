import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function run(script: string, args: string[] = []) {
  return spawnSync(process.execPath, [resolve(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "false" }
  });
}

describe("release scripts", () => {
  it("accepts only the package-version tag", () => {
    const accepted = run("scripts/release-guard.mjs", ["v0.1.0"]);
    const rejected = run("scripts/release-guard.mjs", ["v9.9.9"]);

    expect(accepted.status, accepted.stderr).toBe(0);
    expect(accepted.stdout).toContain("release guard passed");
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("does not match v0.1.0");
  });

  it("finds no credential material in tracked source", () => {
    const result = run("scripts/scan-secrets.mjs");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("tracked secret scan passed");
  });
});
