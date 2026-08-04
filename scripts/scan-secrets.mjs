import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanTrackedFile } from "./secret-scan-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "buffer" });
if (tracked.status !== 0) throw new Error(`git ls-files failed: ${tracked.stderr.toString("utf8")}`);

const findings = [];

for (const relativePath of tracked.stdout.toString("utf8").split("\0").filter(Boolean)) {
  const path = resolve(ROOT, relativePath);
  const content = readFileSync(path);
  findings.push(...scanTrackedFile(relativePath, content).map((finding) => `${relativePath}: ${finding}`));
}

if (findings.length > 0) throw new Error(`secret scan failed\n${findings.join("\n")}`);
process.stdout.write("tracked secret scan passed\n");
