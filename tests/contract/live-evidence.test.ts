import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("release evidence contract", () => {
  it("keeps source, packaged, installed, live, and released evidence separate", () => {
    const live = read("docs/LIVE.md");

    for (const layer of ["Source", "Merged-main CI", "Packaged", "Installed", "Live OAuth and Sheets", "Released"]) {
      expect(live).toContain(`| ${layer} |`);
    }
    expect(live).toContain("49e8ec02a697bda85afc0307f12fb1b9c1b1b829");
    expect(live).toContain("30933114823");
    expect(live).toContain("| Installed | PENDING |");
    expect(live).toContain("| Live OAuth and Sheets | PENDING |");
    expect(live).toContain("| Released | PENDING |");
  });

  it("requires installation, OAuth, tool, persistence, revoke, and privacy canaries", () => {
    const canary = read("docs/canary-template.md");

    for (const evidence of [
      "without Terminal input", "google_auth_status", "connect_google", "get_spreadsheet_metadata",
      "read_sheet_sample", "read_sheet_ranges", "Restart Claude Desktop", "Revoke access",
      "No credential, token, Sheet value, or Sheet title"
    ]) {
      expect(canary).toContain(evidence);
    }
  });

  it("keeps 0.1.0 unreleased before the live canary", () => {
    expect(read("CHANGELOG.md")).toContain("Status: unreleased until the Claude Desktop OAuth/Sheets host canary passes.");
  });
});
