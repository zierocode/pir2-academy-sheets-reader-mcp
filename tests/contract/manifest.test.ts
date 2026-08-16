import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");

const TOOL_NAMES = [
  "google_auth_status",
  "connect_google",
  "diagnose_google_setup",
  "get_spreadsheet_metadata",
  "read_sheet_sample",
  "read_sheet_ranges"
];

function readManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, unknown>;
}

describe("MCPB manifest contract", () => {
  it("uses a Live Artifact-safe display name", () => {
    const manifest = readManifest();
    const displayName = manifest.display_name;

    expect(displayName).toBe("PiR2-Sheets-Reader");
    expect(displayName).toMatch(/^[A-Za-z0-9-]+$/);
    expect(String(displayName)).not.toMatch(/\s/);
  });

  it("declares the stable PiR2 identity and Node 0.4 server", () => {
    const manifest = readManifest();

    expect(manifest).toMatchObject({
      manifest_version: "0.4",
      name: "pir2-academy-sheets-reader",
      display_name: "PiR2-Sheets-Reader",
      description: "MCP สำหรับอ่าน Google Sheet แบบ read-only โดย PiR2 Academy",
      long_description: "MCP แบบ local สำหรับคลาส Advanced Claude Cowork ใช้อ่าน Google Sheet แบบ read-only ผู้เรียนเชื่อม Google Cloud Desktop OAuth ของตัวเอง โดย token เก็บใน credential vault ของระบบปฏิบัติการ",
      author: { name: "PiR2 Academy" },
      repository: {
        type: "git",
        url: "https://github.com/zierocode/pir2-academy-sheets-reader-mcp"
      },
      license: "MIT",
      keywords: ["google-sheets", "read-only", "dashboard", "pir2-academy"],
      compatibility: { platforms: ["darwin", "win32"], runtimes: { node: ">=20" } },
      server: {
        type: "node",
        entry_point: "server/index.js",
        mcp_config: {
          command: "node",
          args: ["${__dirname}/server/index.js"],
          env: {
            GOOGLE_OAUTH_CREDENTIALS_FILE: "${user_config.google_oauth_credentials_file}"
          }
        }
      }
    });
  });

  it("requires the learner-owned OAuth credential picker without bundling credentials", () => {
    const manifest = readManifest();

    expect(manifest.user_config).toMatchObject({
      google_oauth_credentials_file: {
        type: "file",
        title: "ไฟล์ Google Desktop OAuth",
        description: "เลือกไฟล์ credentials JSON ที่ดาวน์โหลดจาก Google Cloud project ของคุณ",
        required: true,
        multiple: false
      }
    });
  });

  it("statically declares the six stable read-only and diagnostic tools", () => {
    const manifest = readManifest();
    const tools = manifest.tools as Array<{ name?: string }>;

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
  });
});
