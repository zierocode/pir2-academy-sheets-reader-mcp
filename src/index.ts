import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildServerIdentity, runStdioServer } from "./server.js";

export { buildServerIdentity } from "./server.js";

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];

  return entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href;
}

function runProcessEntryPoint(): void {
  void runStdioServer().catch(() => {
    process.exitCode = 1;
  });
}

if (isDirectExecution()) {
  runProcessEntryPoint();
}
