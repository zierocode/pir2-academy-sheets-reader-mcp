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

    expect(readme).toContain("## ติดตั้งใน Claude Desktop");
    expect(readme).toMatch(/macOS/i);
    expect(readme).toMatch(/Windows/i);
    expect(readme).toContain("ผู้เรียนไม่ต้องใช้ Terminal");
    expect(readme).toContain("PiR2 Academy — Sheets Reader");
    expect(readme).toContain("google_auth_status");
    expect(readme).toContain("connect_google");
  });

  it("requires a learner-owned Google project and documents the workshop auth lifecycle", () => {
    const setup = read("docs/setup-google-project.md");

    expect(setup).toContain("# ตั้งค่า Google project ของตัวเอง");
    expect(setup).toContain("project ของตัวเอง");
    expect(setup).toContain("Google Sheets API");
    expect(setup).toContain("Desktop app");
    expect(setup).toContain("Testing");
    expect(setup).toMatch(/test user/i);
    expect(setup).toMatch(/7 วัน/i);
    expect(setup).toContain("https://www.googleapis.com/auth/spreadsheets.readonly");
    expect(setup).toMatch(/บัญชีบริษัท|โรงเรียน/i);
    expect(setup).toMatch(/ผู้ดูแลระบบ|administrator|admin/i);
    expect(setup).toMatch(/ไม่ใช้ OAuth application หรือ API key ส่วนกลางของ PiR/i);
  });

  it("states the actual privacy and authorization boundaries", () => {
    const privacy = read("docs/privacy.md");

    expect(privacy).toContain("# Privacy และขอบเขตข้อมูล");
    expect(privacy).toMatch(/read-only/i);
    expect(privacy).toMatch(/Sheets ทั้งหมด/i);
    expect(privacy).toMatch(/Sheet URL หรือ spreadsheet ID ที่ระบุ/i);
    expect(privacy).toMatch(/Keychain/i);
    expect(privacy).toMatch(/Windows Credential Manager/i);
    expect(privacy).toMatch(/ส่งกลับให้ Claude/i);
    expect(privacy).toMatch(/ไม่มี PiR.*OAuth broker/i);
    expect(privacy).toMatch(/revoke|ยกเลิกการเข้าถึง/i);
  });

  it("documents architecture, troubleshooting, and layered verification", () => {
    const architecture = read("docs/architecture.md");
    const troubleshooting = read("docs/troubleshooting.md");
    const testing = read("docs/TESTING.md");

    expect(architecture).toContain("# Architecture");
    expect(architecture).toContain("Refresh dashboard");
    expect(architecture).toMatch(/Dashboard Skill/i);
    expect(troubleshooting).toContain("# วิธีแก้ปัญหา");
    expect(troubleshooting).toMatch(/7 วัน/i);
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
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("npm run release:guard");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("--event push");
    expect(workflow).toContain("--status success");
    expect(workflow).toContain("npm run bundle:verify");
    expect(workflow).toContain(".mcpb.sha256");
    expect(workflow).toContain("gh release create");
  });
});
