import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("public learner documentation", () => {
  it("gives a no-Terminal macOS and Windows installation path", () => {
    const readme = read("README.md");

    expect(readme).toContain("## Install in Claude Desktop");
    expect(readme).toMatch(/macOS/i);
    expect(readme).toMatch(/Windows/i);
    expect(readme).toMatch(/You do not need (?:to use )?(?:the )?Terminal/i);
    expect(readme).toContain("PiR2 Academy — Sheets Reader");
    expect(readme).toContain("google_auth_status");
    expect(readme).toContain("connect_google");
  });

  it("requires a learner-owned Google project and documents the workshop auth lifecycle", () => {
    const setup = read("docs/setup-google-project.md");

    expect(setup).toContain("# Set up your own Google project");
    expect(setup).toMatch(/owned by you/i);
    expect(setup).toContain("Google Sheets API");
    expect(setup).toContain("Desktop app");
    expect(setup).toContain("Testing");
    expect(setup).toMatch(/test user/i);
    expect(setup).toMatch(/7 days/i);
    expect(setup).toContain("https://www.googleapis.com/auth/spreadsheets.readonly");
    expect(setup).toMatch(/company-managed|work or school/i);
    expect(setup).toMatch(/administrator|admin/i);
    expect(setup).toMatch(/does not use a shared PiR/i);
  });

  it("states the actual privacy and authorization boundaries", () => {
    const privacy = read("docs/privacy.md");

    expect(privacy).toContain("# Privacy and data boundaries");
    expect(privacy).toMatch(/read-only/i);
    expect(privacy).toMatch(/all Google Sheets/i);
    expect(privacy).toMatch(/explicit.*URL|URL.*explicit/i);
    expect(privacy).toMatch(/Keychain/i);
    expect(privacy).toMatch(/Windows Credential Manager/i);
    expect(privacy).toMatch(/returned to Claude/i);
    expect(privacy).toMatch(/no PiR.*OAuth broker/i);
    expect(privacy).toMatch(/revoke/i);
  });

  it("documents architecture, troubleshooting, and layered verification", () => {
    const architecture = read("docs/architecture.md");
    const troubleshooting = read("docs/troubleshooting.md");
    const testing = read("docs/TESTING.md");

    expect(architecture).toContain("# Architecture");
    expect(architecture).toContain("Refresh dashboard");
    expect(architecture).toMatch(/Dashboard Skill/i);
    expect(troubleshooting).toContain("# Troubleshooting");
    expect(troubleshooting).toMatch(/7-day|7 day/i);
    expect(troubleshooting).toMatch(/redirect_uri_mismatch/);
    expect(troubleshooting).toMatch(/administrator|admin/i);
    expect(testing).toContain("# Testing and evidence");
    expect(testing).toMatch(/source/i);
    expect(testing).toMatch(/packaged/i);
    expect(testing).toMatch(/installed/i);
    expect(testing).toMatch(/live canary/i);
    expect(testing).toMatch(/Windows ARM64/i);
    expect(testing).toMatch(/Windows x64/i);
  });
});

describe("CI and release contracts", () => {
  it("checks code, bundles, audits, and secrets on the four target matrices", () => {
    const workflow = read(".github/workflows/ci.yml");

    for (const platform of ["macOS ARM64", "macOS Intel", "Windows ARM64", "Windows x64"]) {
      expect(workflow).toContain(platform);
    }
    expect(workflow).toContain("npm run bundle:verify");
    expect(workflow).toContain("npm run bundle");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run audit:high");
    expect(workflow).toContain("npm run audit:tooling");
    expect(workflow).toContain("npm run scan:secrets");
  });

  it("creates checksummed release artifacts only from matching version tags", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toMatch(/tags:/);
    expect(workflow).toContain("v*");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("npm run release:guard");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("--event push");
    expect(workflow).toContain("--status success");
    expect(workflow).toContain("npm run bundle:verify");
    expect(workflow).toContain(".mcpb.sha256");
    expect(workflow).toContain("gh release create");
  });
});
