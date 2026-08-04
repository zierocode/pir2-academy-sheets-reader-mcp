import { afterEach, describe, expect, it, vi } from "vitest";
import { hashSpreadsheetId, type SafeLogEvent, writeDiagnostic } from "../../src/logging.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeDiagnostic", () => {
  it("writes one JSON diagnostic to stderr without writing to stdout", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spreadsheetIdHash = hashSpreadsheetId("abc");

    writeDiagnostic({
      requestId: "request-789",
      tool: "read_sheet_ranges",
      durationMs: 18,
      status: "failure",
      spreadsheetIdHash,
      counts: {
        ranges: 2,
        cells: 18
      }
    });

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledOnce();
    const diagnostic = String(stderrWrite.mock.calls[0]?.[0]);

    expect(diagnostic).toMatch(/\n$/);
    expect(JSON.parse(diagnostic)).toEqual({
      requestId: "request-789",
      tool: "read_sheet_ranges",
      durationMs: 18,
      status: "failure",
      spreadsheetIdHash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      counts: {
        cells: 18,
        ranges: 2
      }
    });
  });

  it("omits unexpected runtime fields before serializing the diagnostic", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const spreadsheetIdHash = hashSpreadsheetId("abc");
    const unsafeEvent = {
      requestId: "request-999",
      tool: "get_spreadsheet_metadata",
      durationMs: 4,
      status: "success",
      spreadsheetIdHash,
      counts: {
        tabs: 3
      },
      title: "Learner budget",
      value: "Confidential amount",
      url: "https://docs.google.com/spreadsheets/d/example",
      token: "oauth-secret"
    } as unknown as SafeLogEvent;

    writeDiagnostic(unsafeEvent);

    expect(JSON.parse(String(stderrWrite.mock.calls[0]?.[0]))).toEqual({
      requestId: "request-999",
      tool: "get_spreadsheet_metadata",
      durationMs: 4,
      status: "success",
      spreadsheetIdHash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      counts: {
        tabs: 3
      }
    });
  });

  it.each([
    ["raw spreadsheet ID", "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd"],
    ["short hash", "e5f6a7b8"]
  ])("omits a %s supplied by an unsafe runtime caller", (_kind, spreadsheetIdHash) => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const unsafeEvent = {
      requestId: "request-1100",
      tool: "read_sheet_sample",
      durationMs: 7,
      status: "success",
      spreadsheetIdHash
    } as unknown as SafeLogEvent;

    writeDiagnostic(unsafeEvent);

    expect(JSON.parse(String(stderrWrite.mock.calls[0]?.[0]))).toEqual({
      requestId: "request-1100",
      tool: "read_sheet_sample",
      durationMs: 7,
      status: "success"
    });
  });

  it("omits non-numeric count values supplied by an unsafe runtime caller", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const unsafeEvent = {
      requestId: "request-1000",
      tool: "read_sheet_sample",
      durationMs: 6,
      status: "success",
      counts: {
        cells: "Confidential cell value",
        rows: 2
      }
    } as unknown as SafeLogEvent;

    writeDiagnostic(unsafeEvent);

    expect(JSON.parse(String(stderrWrite.mock.calls[0]?.[0]))).toEqual({
      requestId: "request-1000",
      tool: "read_sheet_sample",
      durationMs: 6,
      status: "success",
      counts: {
        rows: 2
      }
    });
  });
});
