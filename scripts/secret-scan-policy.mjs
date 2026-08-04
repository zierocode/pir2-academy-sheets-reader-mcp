import { basename } from "node:path";

const MAX_TEXT_BYTES = 2_000_000;
const forbiddenName = /^(?:credentials|tokens?)\.json$|^client_secret[^/]*\.json$/i;
const forbiddenContent = [
  /"client_secret"\s*:/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /ya29\.[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /"(?:refresh_token|access_token)"\s*:\s*"(?!unit-test|fixture|redacted)[^"]{8,}"/i,
  /\bBearer\s+[A-Za-z0-9._~-]{20,}/i
];

export function scanTrackedFile(relativePath, content) {
  const findings = [];
  if (forbiddenName.test(basename(relativePath))) findings.push("forbidden credential filename");
  if (content.includes(0)) return findings;
  if (content.length > MAX_TEXT_BYTES) return [...findings, "oversized text file requires manual secret review"];

  const text = content.toString("utf8");
  const scannable = relativePath.startsWith("tests/fixtures/oauth/")
    ? text.replace(/"client_secret"\s*:\s*"unit-test-[^"]+"/g, '"fixture_secret":"redacted"')
    : text;
  if (forbiddenContent.some((pattern) => pattern.test(scannable))) findings.push("credential-like content");
  return findings;
}
