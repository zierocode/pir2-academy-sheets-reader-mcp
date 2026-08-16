import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const bundleName = `pir2-academy-sheets-reader-${packageJson.version}.mcpb`;
const bundle = resolve(ROOT, "dist", bundleName);
const checksumFile = `${bundle}.sha256`;
const unpackRoot = mkdtempSync(resolve(tmpdir(), "pir2-sheets-verify-"));
const NPM_CLI = process.env.npm_execpath;
const TOOLING = resolve(ROOT, "tools/mcpb-cli");
const MCPB_CLI = resolve(TOOLING, "node_modules/@anthropic-ai/mcpb/dist/cli/cli.js");
if (!NPM_CLI) throw new Error("run this script through npm so the locked npm CLI is available");

function fail(message) {
  throw new Error(message);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

try {
  if (!existsSync(bundle) || !existsSync(checksumFile)) fail("bundle or checksum is missing");
  const expected = readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(bundle)).digest("hex");
  if (expected !== actual) fail("SHA-256 checksum mismatch");

  const install = spawnSync(process.execPath, [NPM_CLI, "ci", "--ignore-scripts", "--no-audit"], {
    cwd: TOOLING,
    encoding: "utf8"
  });
  if (install.status !== 0) fail(`locked MCPB tooling install failed\n${install.stderr}`);
  const audit = spawnSync(process.execPath, [NPM_CLI, "audit", "--audit-level=high"], { cwd: TOOLING, encoding: "utf8" });
  if (audit.status !== 0) fail(`MCPB tooling audit failed\n${audit.stdout}\n${audit.stderr}`);

  const unpack = spawnSync(process.execPath, [MCPB_CLI, "unpack", bundle, unpackRoot], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (unpack.status !== 0) fail(`MCPB unpack failed\n${unpack.stderr}`);

  const roots = readdirSync(unpackRoot).map((name) => resolve(unpackRoot, name));
  const packageRoot = roots.length === 1 && statSync(roots[0]).isDirectory() ? roots[0] : unpackRoot;
  const allowedRoots = new Set(["manifest.json", "icon.png", "package.json", "server", "node_modules"]);
  for (const name of readdirSync(packageRoot)) {
    if (!allowedRoots.has(name)) fail(`unexpected top-level bundle entry: ${name}`);
  }
  const serverFiles = walk(resolve(packageRoot, "server"));
  if (serverFiles.length === 0 || serverFiles.some((path) => !path.endsWith(".js"))) {
    fail("server allowlist permits compiled JavaScript files only");
  }
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
  const expectedTools = [
    "google_auth_status", "connect_google", "get_spreadsheet_metadata",
    "read_sheet_sample", "read_sheet_ranges"
  ];
  if (JSON.stringify(manifest.tools.map((tool) => tool.name)) !== JSON.stringify(expectedTools)) {
    fail("static tool declarations do not match the stable contract");
  }

  const nativePackages = [
    "keyring-darwin-arm64", "keyring-darwin-x64",
    "keyring-win32-arm64-msvc", "keyring-win32-x64-msvc"
  ];
  for (const name of nativePackages) {
    if (!existsSync(resolve(packageRoot, "node_modules/@napi-rs", name))) fail(`missing native package ${name}`);
  }

  const forbiddenDevelopmentPackages = [
    "typescript", "vitest", "vite", "eslint", "@typescript-eslint", "@rolldown"
  ];
  for (const name of forbiddenDevelopmentPackages) {
    if (existsSync(resolve(packageRoot, "node_modules", name))) {
      fail(`development-only package included: ${name}`);
    }
  }

  const forbiddenNames = /(^|\/)(\.env(?:\.|$)|credentials\.json$|client_secret[^/]*\.json$|tokens?\.json$)/i;
  const forbiddenContent = /("client_secret"\s*:|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ya29\.[A-Za-z0-9_-]+)/;
  for (const path of walk(packageRoot)) {
    const name = relative(packageRoot, path).replaceAll("\\", "/");
    if (forbiddenNames.test(name)) fail(`forbidden credential-like file included: ${name}`);
    if (!name.startsWith("node_modules/") && statSync(path).size <= 2_000_000) {
      const content = readFileSync(path);
      if (!content.includes(0) && forbiddenContent.test(content.toString("utf8"))) {
        fail(`credential-like content included: ${name}`);
      }
    }
  }

  process.stdout.write(`bundle verified: ${bundleName}\n`);
} finally {
  rmSync(unpackRoot, { recursive: true, force: true });
}
