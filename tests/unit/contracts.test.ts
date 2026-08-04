import { describe, expect, it } from "vitest";
import { failure, success } from "../../src/contracts.js";
import type { ErrorCode } from "../../src/errors.js";
import { hashSpreadsheetId, type SafeLogEvent } from "../../src/logging.js";

type ExpectedErrorCode =
  | "CREDENTIALS_NOT_CONFIGURED"
  | "INVALID_CREDENTIAL_FILE"
  | "AUTH_REQUIRED"
  | "AUTH_RECONNECT_REQUIRED"
  | "AUTH_CANCELLED"
  | "AUTH_TIMEOUT"
  | "TOKEN_STORE_UNAVAILABLE"
  | "INVALID_SPREADSHEET_REFERENCE"
  | "SPREADSHEET_NOT_FOUND_OR_FORBIDDEN"
  | "SHEET_SELECTION_REQUIRED"
  | "SHEET_NOT_FOUND"
  | "INVALID_RANGE"
  | "RESPONSE_LIMIT_EXCEEDED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "GOOGLE_API_ERROR";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type ErrorCodesMatchApprovedContract = Assert<Equal<ErrorCode, ExpectedErrorCode>>;

const errorCodesMatchApprovedContract: ErrorCodesMatchApprovedContract = true;

const safeDiagnostic: SafeLogEvent = {
  requestId: "request-123",
  tool: "read_sheet_sample",
  durationMs: 12,
  status: "success",
  spreadsheetIdHash: hashSpreadsheetId("abc"),
  counts: {
    cells: 6,
    rows: 2
  }
};

const diagnosticWithValue: SafeLogEvent = {
  ...safeDiagnostic,
  // @ts-expect-error Cell values are not diagnostic fields.
  value: "learner data"
};

const diagnosticWithTitle: SafeLogEvent = {
  ...safeDiagnostic,
  // @ts-expect-error Sheet titles are not diagnostic fields.
  title: "Budget FY26"
};

const diagnosticWithUrl: SafeLogEvent = {
  ...safeDiagnostic,
  // @ts-expect-error Spreadsheet URLs are not diagnostic fields.
  url: "https://docs.google.com/spreadsheets/d/example"
};

const diagnosticWithToken: SafeLogEvent = {
  ...safeDiagnostic,
  // @ts-expect-error OAuth tokens are not diagnostic fields.
  token: "secret"
};

const diagnosticWithRawSpreadsheetId: SafeLogEvent = {
  ...safeDiagnostic,
  // @ts-expect-error Raw spreadsheet IDs are not log hashes.
  spreadsheetIdHash: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd"
};

void errorCodesMatchApprovedContract;
void diagnosticWithValue;
void diagnosticWithTitle;
void diagnosticWithUrl;
void diagnosticWithToken;
void diagnosticWithRawSpreadsheetId;

describe("tool result contracts", () => {
  it("derives a lowercase SHA-256 hash for spreadsheet identifiers", () => {
    expect(hashSpreadsheetId("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("returns a stable success envelope for tool data", () => {
    expect(
      success(
        { spreadsheetId: "spreadsheet-123", cells: 6 },
        "request-123",
        "2026-08-04T08:30:00.000Z"
      )
    ).toEqual({
      ok: true,
      data: { spreadsheetId: "spreadsheet-123", cells: 6 },
      meta: {
        requestId: "request-123",
        retrievedAt: "2026-08-04T08:30:00.000Z"
      }
    });
  });

  it("returns a stable actionable failure envelope", () => {
    expect(
      failure(
        {
          code: "INVALID_RANGE",
          message: "The requested range is invalid.",
          userAction: "Choose a valid A1 range and try again.",
          retryable: false
        },
        "request-456"
      )
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_RANGE",
        message: "The requested range is invalid.",
        userAction: "Choose a valid A1 range and try again.",
        retryable: false
      },
      meta: {
        requestId: "request-456"
      }
    });
  });
});
