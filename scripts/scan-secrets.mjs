import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "buffer" });
if (tracked.status !== 0) throw new Error(`git ls-files failed: ${tracked.stderr.toString("utf8")}`);

const forbiddenName = /^(?:credentials|tokens?)\.json$|^client_secret[^/]*\.json$/i;
const forbiddenContent = [
  /"client_secret"\s*:/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /ya29\.[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /"(?:refresh_token|access_token)"\s*:\s*"(?!unit-test|fixture|redacted)[^"]{8,}"/i,
  /\bBearer\s+[A-Za-z0-9._~-]{20,}/i
];
const findings = [];

for (const relativePath of tracked.stdout.toString("utf8").split("\0").filter(Boolean)) {
  if (forbiddenName.test(basename(relativePath))) findings.push(`${relativePath}: forbidden credential filename`);
  const path = resolve(ROOT, relativePath);
  const content = readFileSync(path);
  if (content.includes(0)) continue;
  if (content.length > 2_000_000) {
    findings.push(`${relativePath}: oversized text file requires manual secret review`);
    continue;
  }
  const text = content.toString("utf8");
  const scannable = relativePath.startsWith("tests/fixtures/oauth/")
    ? text.replace(/"client_secret"\s*:\s*"unit-test-[^"]+"/g, '"fixture_secret":"redacted"')
    : text;
  if (forbiddenContent.some((pattern) => pattern.test(scannable))) findings.push(`${relativePath}: credential-like content`);
}

if (findings.length > 0) throw new Error(`secret scan failed\n${findings.join("\n")}`);
process.stdout.write("tracked secret scan passed\n");
