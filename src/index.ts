import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function buildServerIdentity(): { name: string; version: string } {
  return {
    name: "pir2-academy-sheets-reader",
    version: "0.1.0"
  };
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];

  return entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href;
}

function runProcessEntryPoint(): void {
  // Stdio transport wiring belongs to its owning task. Keep stdout reserved for JSON-RPC.
}

if (isDirectExecution()) {
  runProcessEntryPoint();
}
