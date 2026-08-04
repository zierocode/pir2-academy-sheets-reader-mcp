import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { SheetsReaderError, SheetsReader } from "../../src/google/sheets-client.js";

const ID = "12345678901234567890123456789012345678901234";

function metadata() {
  return {
    data: {
      spreadsheetId: ID,
      properties: { title: "Sales", locale: "th_TH", timeZone: "Asia/Bangkok" },
      sheets: [
        { properties: { sheetId: 0, title: "Overview", index: 0, gridProperties: { rowCount: 100, columnCount: 12 } } },
        { properties: { sheetId: 7, title: "Hidden", index: 1, hidden: true, gridProperties: { rowCount: 10, columnCount: 3 } } }
      ]
    }
  };
}

function api() {
  return {
    spreadsheets: {
      get: vi.fn().mockResolvedValue(metadata()),
      values: {
        get: vi.fn().mockResolvedValue({ data: { range: "Overview!A1:C2", values: [["Name", "Total"], ["A", 42]] } }),
        batchGet: vi.fn().mockResolvedValue({ data: { spreadsheetId: ID, valueRanges: [{ range: "Overview!A1:B2", values: [[1, 2], [3, 4]] }] } })
      }
    }
  };
}

describe("SheetsReader", () => {
  it("returns metadata and marks a requested gid", async () => {
    const client = api();
    const reader = new SheetsReader(client);
    const result = await reader.getMetadata(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`);
    expect(result).toMatchObject({ spreadsheetId: ID, title: "Sales", locale: "th_TH", tabs: [{ sheetId: 0, requested: true }, { sheetId: 7, hidden: true }] });
    expect(client.spreadsheets.get).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: ID, includeGridData: false }), { retry: false });
  });

  it("reads a bounded sample using typed/display/formula render modes", async () => {
    const client = api();
    const reader = new SheetsReader(client);
    await reader.readSample({ spreadsheet: ID, sheetName: "Overview", maxRows: 2, maxColumns: 3, valueMode: "typed" });
    expect(client.spreadsheets.values.get).toHaveBeenLastCalledWith(expect.objectContaining({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" }), { retry: false });
    await reader.readSample({ spreadsheet: ID, sheetName: "Overview", valueMode: "display" });
    expect(client.spreadsheets.values.get).toHaveBeenLastCalledWith(expect.objectContaining({ valueRenderOption: "FORMATTED_VALUE" }), { retry: false });
    await reader.readSample({ spreadsheet: ID, sheetName: "Overview", valueMode: "formula" });
    expect(client.spreadsheets.values.get).toHaveBeenLastCalledWith(expect.objectContaining({ valueRenderOption: "FORMULA" }), { retry: false });
  });

  it("requires selection when multiple visible tabs exist and reports missing tabs", async () => {
    const client = api();
    client.spreadsheets.get.mockResolvedValueOnce({ data: { ...metadata().data, sheets: [...metadata().data.sheets, { properties: { sheetId: 9, title: "Other", index: 2, gridProperties: { rowCount: 3, columnCount: 3 } } }] } });
    await expect(new SheetsReader(client).readSample({ spreadsheet: ID })).rejects.toMatchObject({ code: "SHEET_SELECTION_REQUIRED" });
    await expect(new SheetsReader(api()).readSample({ spreadsheet: ID, sheetName: "Missing" })).rejects.toMatchObject({ code: "SHEET_NOT_FOUND" });
  });

  it("reads explicit ranges without silent truncation", async () => {
    const client = api();
    const result = await new SheetsReader(client).readRanges({ spreadsheet: ID, ranges: ["Overview!A1:B2"] });
    expect(result).toEqual({ spreadsheetId: ID, ranges: [{ requestedRange: "Overview!A1:B2", resolvedRange: "Overview!A1:B2", values: [[1, 2], [3, 4]] }], totalCells: 4 });
    expect(client.spreadsheets.values.batchGet).toHaveBeenCalledWith(expect.objectContaining({ ranges: ["Overview!A1:B2"] }), { retry: false });
  });

  it("retries quota failures at most twice and honors Retry-After", async () => {
    const client = api();
    const quota = { code: 429, response: { status: 429, headers: { "retry-after": "2" }, data: { error: { errors: [] } } } };
    client.spreadsheets.get.mockRejectedValueOnce(quota).mockRejectedValueOnce(quota).mockResolvedValueOnce(metadata());
    const sleep = vi.fn().mockResolvedValue(undefined);
    await new SheetsReader(client, { sleep }).getMetadata(ID);
    expect(client.spreadsheets.get).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });

  it("maps 401, permission, network, invalid range, and oversized responses", async () => {
    const authClient = api();
    authClient.spreadsheets.get.mockRejectedValueOnce({ code: 401, response: { status: 401 } });
    await expect(new SheetsReader(authClient).getMetadata(ID)).rejects.toMatchObject({ code: "AUTH_RECONNECT_REQUIRED" });
    const permissionClient = api();
    permissionClient.spreadsheets.get.mockRejectedValueOnce({ code: 403, response: { status: 403, data: { error: { errors: [{ reason: "forbidden" }] } } } });
    await expect(new SheetsReader(permissionClient).getMetadata(ID)).rejects.toMatchObject({ code: "SPREADSHEET_NOT_FOUND_OR_FORBIDDEN" });
    const networkClient = api();
    networkClient.spreadsheets.get.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "ENOTFOUND" }));
    await expect(new SheetsReader(networkClient).getMetadata(ID)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    const rangeClient = api();
    rangeClient.spreadsheets.values.batchGet.mockRejectedValueOnce({ code: 400, response: { status: 400 } });
    await expect(new SheetsReader(rangeClient).readRanges({ spreadsheet: ID, ranges: ["bad range"] })).rejects.toMatchObject({ code: "INVALID_RANGE" });
    const hugeClient = api();
    hugeClient.spreadsheets.values.batchGet.mockResolvedValueOnce({ data: { spreadsheetId: ID, valueRanges: [{ range: "A1:A20001", values: Array.from({ length: 20_001 }, () => [1]) }] } });
    await expect(new SheetsReader(hugeClient).readRanges({ spreadsheet: ID, ranges: ["A1:A20001"] })).rejects.toMatchObject({ code: "RESPONSE_LIMIT_EXCEEDED" });
  });

  it("keeps the adapter source read-only and free of Drive scopes", async () => {
    const source = await readFile(new URL("../../src/google/sheets-client.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/spreadsheets\.values\.(?:append|update|batchUpdate|clear)|spreadsheets\.batchUpdate|auth\/drive/);
    expect(source.match(/retry: false/g)).toHaveLength(3);
  });
});
