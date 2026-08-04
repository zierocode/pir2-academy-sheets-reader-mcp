import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };
const BUNDLE_NAME = `pir2-academy-sheets-reader-${PACKAGE.version}.mcpb`;
const BUNDLE_PATH = resolve(ROOT, "dist", BUNDLE_NAME);
const CHECKSUM_PATH = `${BUNDLE_PATH}.sha256`;
const PACK_SCRIPT = resolve(ROOT, "scripts/pack.mjs");
const VERIFY_SCRIPT = resolve(ROOT, "scripts/verify-bundle.mjs");

function run(script: string) {
  return spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8"
  });
}

describe("MCPB bundle", () => {
  it("packs a deterministic release archive with a matching SHA-256 checksum", () => {
    const result = run(PACK_SCRIPT);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(BUNDLE_PATH)).toBe(true);
    expect(existsSync(CHECKSUM_PATH)).toBe(true);

    const expected = readFileSync(CHECKSUM_PATH, "utf8").trim().split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(BUNDLE_PATH)).digest("hex");

    expect(expected).toBe(actual);
  }, 300_000);

  it("validates archive contents, native keyring variants, static tools, and credential exclusion", () => {
    const result = run(VERIFY_SCRIPT);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("bundle verified");
  }, 300_000);
});
