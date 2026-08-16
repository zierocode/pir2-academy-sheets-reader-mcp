import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
if (manifest.version !== packageJson.version) {
  throw new Error(`manifest version ${manifest.version} must match package version ${packageJson.version}`);
}

const outputDir = resolve(ROOT, "dist");
const output = resolve(outputDir, `pir2-academy-sheets-reader-${packageJson.version}.mcpb`);
const checksum = `${output}.sha256`;
const stagingRoot = mkdtempSync(resolve(tmpdir(), "pir2-sheets-mcpb-"));
const staging = resolve(stagingRoot, "bundle");
const NPM_CLI = process.env.npm_execpath;
const TOOLING = resolve(ROOT, "tools/mcpb-cli");
const MCPB_CLI = resolve(TOOLING, "node_modules/@anthropic-ai/mcpb/dist/cli/cli.js");
if (!NPM_CLI) throw new Error("run this script through npm so the locked npm CLI is available");

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function normalizeZipTimestamps(path) {
  const zip = readFileSync(path);
  let offset = 0;
  while (offset + 4 <= zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      zip.writeUInt16LE(0, offset + 10);
      zip.writeUInt16LE(0x0021, offset + 12);
      const compressedSize = zip.readUInt32LE(offset + 18);
      const nameLength = zip.readUInt16LE(offset + 26);
      const extraLength = zip.readUInt16LE(offset + 28);
      offset += 30 + nameLength + extraLength + compressedSize;
      continue;
    }
    if (signature === 0x02014b50) {
      zip.writeUInt16LE(0, offset + 12);
      zip.writeUInt16LE(0x0021, offset + 14);
      const nameLength = zip.readUInt16LE(offset + 28);
      const extraLength = zip.readUInt16LE(offset + 30);
      const commentLength = zip.readUInt16LE(offset + 32);
      offset += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    if (signature === 0x06054b50) break;
    throw new Error(`unexpected ZIP record at byte ${offset}`);
  }
  writeFileSync(path, zip);
}

try {
  mkdirSync(staging, { recursive: true });
  run(process.execPath, [NPM_CLI, "ci", "--ignore-scripts", "--no-audit"], TOOLING);
  run(process.execPath, [NPM_CLI, "audit", "--audit-level=high"], TOOLING);
  mkdirSync(resolve(staging, "server"), { recursive: true });
  run(process.execPath, [
    resolve(ROOT, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.json",
    "--outDir", resolve(staging, "server"), "--declaration", "false"
  ]);

  cpSync(resolve(ROOT, "manifest.json"), resolve(staging, "manifest.json"));
  cpSync(resolve(ROOT, "assets/icons/icon.png"), resolve(staging, "icon.png"));
  cpSync(resolve(ROOT, "package.json"), resolve(staging, "package.json"));
  cpSync(resolve(ROOT, "package-lock.json"), resolve(staging, "package-lock.json"));

  run(process.execPath, [NPM_CLI, "ci", "--omit=dev", "--ignore-scripts", "--no-audit"], staging);
  run(process.execPath, [NPM_CLI,
    "install", "--omit=dev", "--ignore-scripts", "--force", "--no-save", "--no-audit",
    "@napi-rs/keyring-darwin-arm64@1.3.0",
    "@napi-rs/keyring-darwin-x64@1.3.0",
    "@napi-rs/keyring-win32-arm64-msvc@1.3.0",
    "@napi-rs/keyring-win32-x64-msvc@1.3.0"
  ], staging);
  rmSync(resolve(staging, "package-lock.json"));
  writeFileSync(resolve(staging, "package.json"), `${JSON.stringify({
    name: packageJson.name,
    version: packageJson.version,
    private: true,
    type: "module",
    engines: packageJson.engines,
    dependencies: packageJson.dependencies
  }, null, 2)}\n`, "utf8");

  mkdirSync(outputDir, { recursive: true });
  rmSync(output, { force: true });
  rmSync(checksum, { force: true });
  run(process.execPath, [MCPB_CLI, "validate", resolve(staging, "manifest.json")]);
  run(process.execPath, [MCPB_CLI, "pack", staging, output]);
  normalizeZipTimestamps(output);

  const digest = createHash("sha256").update(readFileSync(output)).digest("hex");
  writeFileSync(checksum, `${digest}  ${basename(output)}\n`, "utf8");
  process.stdout.write(`${output}\n${checksum}\n`);
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
