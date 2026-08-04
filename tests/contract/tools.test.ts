import { describe, expect, it, vi } from "vitest";
import type { AuthStatus, ConnectGoogleResult } from "../../src/auth/google-oauth.js";
import type { SpreadsheetMetadata } from "../../src/google/sheets-client.js";
import {
  createToolCatalog,
  type ToolCallResult,
  type ToolServices
} from "../../src/server.js";

const NOW = "2026-08-04T08:00:00.000Z";
const SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

const connectedStatus: AuthStatus = {
  credentialsConfigured: true,
  status: "connected",
  projectId: "learner-project",
  scopeGranted: true,
  tokenExpiresAt: "2026-08-04T09:00:00.000Z"
};

const metadata: SpreadsheetMetadata = {
  spreadsheetId: SPREADSHEET_ID,
  title: "Sales",
  locale: "th_TH",
  timeZone: "Asia/Bangkok",
  tabs: [
    {
      sheetId: 0,
      title: "Overview",
      index: 0,
      rowCount: 100,
      columnCount: 12,
      hidden: false,
      requested: false
    }
  ]
};

const sample = {
  spreadsheetId: SPREADSHEET_ID,
  spreadsheetTitle: "Sales",
  sheetId: 0,
  sheetName: "Overview",
  range: "Overview!A1:B2",
  values: [["Revenue", "Orders"], [42, 3]],
  returnedRows: 2,
  returnedColumns: 2,
  truncated: false
};

const ranges = {
  spreadsheetId: SPREADSHEET_ID,
  ranges: [
    {
      requestedRange: "Overview!A1:B2",
      resolvedRange: "Overview!A1:B2",
      values: [["Revenue", "Orders"], [42, 3]]
    }
  ],
  totalCells: 4
};

type Harness = {
  services: ToolServices;
  readSampleInputs: unknown[];
  readRangesInputs: unknown[];
  metadataInputs: string[];
};

function createHarness(status: AuthStatus = connectedStatus): Harness {
  const readSampleInputs: unknown[] = [];
  const readRangesInputs: unknown[] = [];
  const metadataInputs: string[] = [];
  const connect: ConnectGoogleResult = {
    authorizationStarted: true,
    status: "waiting_for_authorization",
    projectId: "learner-project",
    authorizationExpiresAt: "2026-08-04T08:03:00.000Z"
  };

  return {
    services: {
      oauth: {
        status: vi.fn().mockResolvedValue(status),
        start: vi.fn().mockResolvedValue(connect)
      },
      sheets: {
        getMetadata: vi.fn(async (input: string) => {
          metadataInputs.push(input);
          return metadata;
        }),
        readSample: vi.fn(async (input: unknown) => {
          readSampleInputs.push(input);
          return sample;
        }),
        readRanges: vi.fn(async (input: unknown) => {
          readRangesInputs.push(input);
          return ranges;
        })
      }
    },
    readSampleInputs,
    readRangesInputs,
    metadataInputs
  };
}

function catalog(harness: Harness) {
  return createToolCatalog(harness.services, {
    now: () => NOW,
    requestId: () => "request-123",
    diagnostic: () => undefined
  });
}

function tool(harness: Harness, name: string) {
  const found = catalog(harness).find((candidate) => candidate.name === name);
  expect(found, `missing ${name}`).toBeDefined();
  return found!;
}

function expectMatchingContent(result: ToolCallResult, expected: unknown): void {
  expect(result.structuredContent).toEqual(expected);
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify(expected) }]);
}

describe("MCP tool contract", () => {
  it("exposes exactly the documented tool names and learner-facing purposes", () => {
    const harness = createHarness();

    expect(catalog(harness).map(({ name, description }) => ({ name, description }))).toEqual([
      {
        name: "google_auth_status",
        description: "Verify configuration and token readiness without reading Sheet data."
      },
      {
        name: "connect_google",
        description: "Start the explicit learner-approved OAuth flow."
      },
      {
        name: "get_spreadsheet_metadata",
        description: "Resolve a spreadsheet URL or ID and list its tabs."
      },
      {
        name: "read_sheet_sample",
        description: "Return a bounded sample for schema inspection."
      },
      {
        name: "read_sheet_ranges",
        description: "Read explicit bounded A1 ranges after inspection."
      }
    ]);
  });

  it("returns a stable matching success envelope for auth status", async () => {
    const harness = createHarness();
    const result = await tool(harness, "google_auth_status").handler({});
    const expected = {
      ok: true,
      data: connectedStatus,
      meta: { requestId: "request-123", retrievedAt: NOW }
    };

    expect(result.isError).toBeUndefined();
    expectMatchingContent(result, expected);
  });

  it("requires literal confirmation and returns the coordinator result", async () => {
    const harness = createHarness();
    const rejected = await tool(harness, "connect_google").handler({ confirm: false });

    expect(rejected.isError).toBe(true);
    expect(rejected.structuredContent).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED", retryable: false },
      meta: { requestId: "request-123" }
    });
    expect(harness.services.oauth.start).not.toHaveBeenCalled();

    const result = await tool(harness, "connect_google").handler({ confirm: true });
    const expected = {
      ok: true,
      data: {
        authorizationStarted: true,
        status: "waiting_for_authorization",
        projectId: "learner-project",
        authorizationExpiresAt: "2026-08-04T08:03:00.000Z"
      },
      meta: { requestId: "request-123", retrievedAt: NOW }
    };

    expect(harness.services.oauth.start).toHaveBeenCalledWith(true);
    expectMatchingContent(result, expected);
  });

  it("delegates read tools with documented defaults and matching envelopes", async () => {
    const harness = createHarness();

    const metadataResult = await tool(harness, "get_spreadsheet_metadata").handler({
      spreadsheet: SPREADSHEET_ID
    });
    const sampleResult = await tool(harness, "read_sheet_sample").handler({
      spreadsheet: SPREADSHEET_ID
    });
    const rangesResult = await tool(harness, "read_sheet_ranges").handler({
      spreadsheet: SPREADSHEET_ID,
      ranges: ["Overview!A1:B2"]
    });

    expect(harness.metadataInputs).toEqual([SPREADSHEET_ID]);
    expect(harness.readSampleInputs).toEqual([
      { spreadsheet: SPREADSHEET_ID, maxRows: 50, maxColumns: 25, valueMode: "typed" }
    ]);
    expect(harness.readRangesInputs).toEqual([
      { spreadsheet: SPREADSHEET_ID, ranges: ["Overview!A1:B2"], valueMode: "typed" }
    ]);
    expectMatchingContent(metadataResult, {
      ok: true,
      data: metadata,
      meta: { requestId: "request-123", retrievedAt: NOW }
    });
    expectMatchingContent(sampleResult, {
      ok: true,
      data: sample,
      meta: { requestId: "request-123", retrievedAt: NOW }
    });
    expectMatchingContent(rangesResult, {
      ok: true,
      data: ranges,
      meta: { requestId: "request-123", retrievedAt: NOW }
    });
  });

  it("auth-gates reads and never leaks upstream exceptions", async () => {
    const disconnected = createHarness({
      credentialsConfigured: true,
      status: "disconnected",
      projectId: "learner-project",
      scopeGranted: false
    });
    const gated = await tool(disconnected, "read_sheet_sample").handler({
      spreadsheet: SPREADSHEET_ID
    });

    expect(gated.isError).toBe(true);
    expect(gated.structuredContent).toMatchObject({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        userAction: expect.any(String),
        retryable: false
      },
      meta: { requestId: "request-123" }
    });
    expect(disconnected.readSampleInputs).toEqual([]);

    const failing = createHarness();
    failing.services.sheets.getMetadata = vi.fn().mockRejectedValue(
      new Error("google-body: oauth-secret and learner-sheet-title")
    );
    const safe = await tool(failing, "get_spreadsheet_metadata").handler({
      spreadsheet: SPREADSHEET_ID
    });
    const serialized = JSON.stringify(safe.structuredContent);

    expect(safe.isError).toBe(true);
    expect(safe.structuredContent).toMatchObject({
      ok: false,
      error: { code: "GOOGLE_API_ERROR", retryable: false },
      meta: { requestId: "request-123" }
    });
    expect(serialized).not.toContain("oauth-secret");
    expect(serialized).not.toContain("learner-sheet-title");
    expect(safe.content[0]?.text).toBe(serialized);
  });
});
