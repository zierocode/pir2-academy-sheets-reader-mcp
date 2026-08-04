import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");

const TOOL_NAMES = [
  "google_auth_status",
  "connect_google",
  "get_spreadsheet_metadata",
  "read_sheet_sample",
  "read_sheet_ranges"
];

function readManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, unknown>;
}

describe("MCPB manifest contract", () => {
  it("declares the stable PiR2 identity and Node 0.4 server", () => {
    const manifest = readManifest();

    expect(manifest).toMatchObject({
      manifest_version: "0.4",
      name: "pir2-academy-sheets-reader",
      display_name: "PiR2 Academy — Sheets Reader",
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
        title: "Google Desktop OAuth credentials",
        description: "Select the credentials JSON downloaded from your own Google Cloud project.",
        required: true,
        multiple: false
      }
    });
  });

  it("statically declares exactly the five stable read-only tools", () => {
    const manifest = readManifest();
    const tools = manifest.tools as Array<{ name?: string }>;

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
  });
});
