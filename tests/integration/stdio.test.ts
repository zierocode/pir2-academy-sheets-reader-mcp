import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SERVER_PATH = resolve(ROOT, "server/index.js");
const TSC_PATH = resolve(ROOT, "node_modules/typescript/bin/tsc");
const SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

type JsonRpcMessage = {
  id?: number;
  result?: unknown;
  error?: unknown;
};

class StdioHarness {
  readonly messages: JsonRpcMessage[] = [];
  stderr = "";
  private pending = "";

  constructor(readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.consumeStdout(chunk));
    child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
  }

  async request(id: number, method: string, params: unknown): Promise<JsonRpcMessage> {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);

    return this.waitFor(id);
  }

  async stop(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return { code: this.child.exitCode, signal: this.child.signalCode };
    }

    const exited = once(this.child, "exit") as Promise<[number | null, NodeJS.Signals | null]>;
    this.child.stdin.end();
    const [code, signal] = await Promise.race([
      exited,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Server did not exit after stdin closed.")), 10_000))
    ]);
    return { code, signal };
  }

  private consumeStdout(chunk: string): void {
    this.pending += chunk;
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length === 0) continue;
      this.messages.push(JSON.parse(line) as JsonRpcMessage);
    }
  }

  private async waitFor(id: number): Promise<JsonRpcMessage> {
    const existing = this.messages.find((message) => message.id === id);
    if (existing) return existing;

    return new Promise<JsonRpcMessage>((resolveMessage, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for JSON-RPC response ${id}.`));
      }, 5_000);
      const interval = setInterval(() => {
        const message = this.messages.find((candidate) => candidate.id === id);
        if (!message) return;
        clearTimeout(timeout);
        clearInterval(interval);
        resolveMessage(message);
      }, 10);
    });
  }
}

async function compileServer(): Promise<void> {
  const child = spawn(process.execPath, [TSC_PATH, "--project", "tsconfig.json"], {
    cwd: ROOT,
    stdio: "ignore"
  });
  const [code] = await once(child, "exit") as [number | null];
  expect(code).toBe(0);
}

function expectToolFailure(message: JsonRpcMessage, code: string): void {
  const result = message.result as {
    isError?: boolean;
    structuredContent?: { ok?: boolean; error?: { code?: string } };
    content?: Array<{ type?: string; text?: string }>;
  };

  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ ok: false, error: { code } });
  expect(JSON.parse(result.content?.[0]?.text ?? "")).toEqual(result.structuredContent);
}

describe("compiled MCP stdio server", () => {
  let harness: StdioHarness;

  beforeAll(async () => {
    await compileServer();
    const environment = { ...process.env };
    delete environment.GOOGLE_OAUTH_CREDENTIALS_FILE;
    harness = new StdioHarness(spawn(process.execPath, [SERVER_PATH], {
      cwd: ROOT,
      env: environment,
      stdio: "pipe"
    }));
  }, 120_000);

  afterAll(async () => {
    if (harness) {
      await expect(harness.stop()).resolves.toEqual({ code: 0, signal: null });
    }
  }, 30_000);

  it("serves all five tools over pure stdio without attempting real authentication", async () => {
    const initialized = await harness.request(1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" }
    });
    expect(initialized.error).toBeUndefined();
    harness.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

    const listed = await harness.request(2, "tools/list", {});
    const tools = (listed.result as { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "google_auth_status",
      "connect_google",
      "get_spreadsheet_metadata",
      "read_sheet_sample",
      "read_sheet_ranges"
    ]);
    const schemas = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));
    expect(schemas.connect_google).toMatchObject({
      type: "object",
      required: ["confirm"],
      properties: { confirm: { const: true } }
    });
    expect(schemas.get_spreadsheet_metadata).toMatchObject({
      required: ["spreadsheet"],
      properties: { spreadsheet: { type: "string", minLength: 1, maxLength: 2048 } }
    });
    expect(schemas.read_sheet_sample).toMatchObject({
      required: ["spreadsheet"],
      properties: {
        spreadsheet: { type: "string", minLength: 1, maxLength: 2048 },
        maxRows: { minimum: 1, maximum: 200, default: 50 },
        maxColumns: { minimum: 1, maximum: 50, default: 25 },
        valueMode: { default: "typed" }
      }
    });
    expect(schemas.read_sheet_ranges).toMatchObject({
      required: ["spreadsheet", "ranges"],
      properties: {
        spreadsheet: { type: "string", minLength: 1, maxLength: 2048 },
        ranges: { minItems: 1, maxItems: 10, items: { type: "string", maxLength: 200 } },
        valueMode: { default: "typed" }
      }
    });

    const status = await harness.request(3, "tools/call", {
      name: "google_auth_status",
      arguments: {}
    });
    expect(status.error).toBeUndefined();
    expect((status.result as { structuredContent?: unknown }).structuredContent).toMatchObject({
      ok: true,
      data: { credentialsConfigured: false, status: "not_configured", scopeGranted: false }
    });

    const invalidConfirmation = await harness.request(31, "tools/call", {
      name: "connect_google",
      arguments: { confirm: false }
    });
    expectToolFailure(invalidConfirmation, "AUTH_REQUIRED");

    const calls = [
      [4, "connect_google", { confirm: true }],
      [5, "get_spreadsheet_metadata", { spreadsheet: SPREADSHEET_ID }],
      [6, "read_sheet_sample", { spreadsheet: SPREADSHEET_ID }],
      [7, "read_sheet_ranges", { spreadsheet: SPREADSHEET_ID, ranges: ["Overview!A1"] }]
    ] as const;
    for (const [id, name, arguments_] of calls) {
      const response = await harness.request(id, "tools/call", { name, arguments: arguments_ });
      expectToolFailure(response, "CREDENTIALS_NOT_CONFIGURED");
    }

    expect(harness.messages).not.toHaveLength(0);
    expect(harness.stderr).not.toContain("oauth-secret");
    expect(harness.stderr).not.toContain("learner-sheet-title");
  });

  it("redacts an invalid credential path from stdio failures and diagnostics", async () => {
    const secretPath = "/tmp/oauth-secret-learner-sheet-title.json";
    const environment = { ...process.env, GOOGLE_OAUTH_CREDENTIALS_FILE: secretPath };
    const redactionHarness = new StdioHarness(spawn(process.execPath, [SERVER_PATH], {
      cwd: ROOT,
      env: environment,
      stdio: "pipe"
    }));

    try {
      await redactionHarness.request(40, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" }
      });
      redactionHarness.child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`
      );
      const result = await redactionHarness.request(41, "tools/call", {
        name: "connect_google",
        arguments: { confirm: true }
      });

      expectToolFailure(result, "INVALID_CREDENTIAL_FILE");
      expect(JSON.stringify(result.result)).not.toContain(secretPath);
      expect(redactionHarness.stderr).not.toContain(secretPath);
    } finally {
      await expect(redactionHarness.stop()).resolves.toEqual({ code: 0, signal: null });
    }
  });
});
