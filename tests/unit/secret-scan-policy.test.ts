import { describe, expect, it } from "vitest";
import { scanTrackedFile } from "../../scripts/secret-scan-policy.mjs";

function scan(path: string, text: string) {
  return scanTrackedFile(path, Buffer.from(text, "utf8"));
}

describe("secret scan policy", () => {
  it.each([
    [JSON.stringify({ [["refresh", "token"].join("_")]: ["1", "//", "real-google-refresh-token-value"].join("") }), "refresh token"],
    [JSON.stringify({ [["access", "token"].join("_")]: "generic-access-token-value" }), "access token"],
    [["Authorization:", "Bearer", "abcdefghijklmnopqrstuvwxyz012345"].join(" "), "Bearer token"]
  ])("rejects %s (%s)", (content) => {
    expect(scan("example.txt", content)).toContain("credential-like content");
  });

  it("rejects oversized text instead of silently skipping it", () => {
    expect(scan("large.txt", "x".repeat(2_000_001))).toContain("oversized text file requires manual secret review");
  });

  it("allows explicit unit-test and redacted fixture values", () => {
    const clientSecret = JSON.stringify({ [["client", "secret"].join("_")]: "unit-test-secret" });
    const redactedAccess = JSON.stringify({ [["access", "token"].join("_")]: "redacted" });
    expect(scan("tests/fixtures/oauth/example.json", clientSecret)).toEqual([]);
    expect(scan("example.json", redactedAccess)).toEqual([]);
  });

  it("does not exempt a client secret outside the OAuth fixture directory", () => {
    const content = JSON.stringify({ [["client", "secret"].join("_")]: "unit-test-secret" });
    expect(scan("example.json", content)).toContain("credential-like content");
  });
});
