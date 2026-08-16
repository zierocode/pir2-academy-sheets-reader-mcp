import { createHash } from "node:crypto";

export type SafeLogTool =
  | "google_auth_status"
  | "connect_google"
  | "diagnose_google_setup"
  | "get_spreadsheet_metadata"
  | "read_sheet_sample"
  | "read_sheet_ranges";

export type SafeLogStatus = "success" | "failure";

export type SafeLogCounts = Partial<
  Record<"cells" | "rows" | "columns" | "ranges" | "tabs", number>
>;

const safeLogCountKeys = ["cells", "rows", "columns", "ranges", "tabs"] as const;
const spreadsheetIdHashPattern = /^[a-f0-9]{64}$/;

declare const spreadsheetIdHashBrand: unique symbol;

export type SpreadsheetIdHash = string & {
  readonly [spreadsheetIdHashBrand]: "SpreadsheetIdHash";
};

export type SafeLogEvent = {
  requestId: string;
  tool: SafeLogTool;
  durationMs: number;
  status: SafeLogStatus;
  errorCode?: string;
  spreadsheetIdHash?: SpreadsheetIdHash;
  counts?: SafeLogCounts;
};

export function hashSpreadsheetId(spreadsheetId: string): SpreadsheetIdHash {
  return createHash("sha256").update(spreadsheetId).digest("hex") as SpreadsheetIdHash;
}

export function writeDiagnostic(event: SafeLogEvent): void {
  const counts = selectSafeCounts(event.counts);
  const spreadsheetIdHash = selectSafeSpreadsheetIdHash(event.spreadsheetIdHash);
  const diagnostic = {
    requestId: event.requestId,
    tool: event.tool,
    durationMs: event.durationMs,
    status: event.status,
    ...(typeof event.errorCode === "string" && /^[A-Z][A-Z0-9_]{2,64}$/.test(event.errorCode)
      ? { errorCode: event.errorCode }
      : {}),
    ...(spreadsheetIdHash === undefined
      ? {}
      : { spreadsheetIdHash }),
    ...(counts === undefined ? {} : { counts })
  };

  process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
}

function selectSafeSpreadsheetIdHash(
  spreadsheetIdHash: SpreadsheetIdHash | undefined
): SpreadsheetIdHash | undefined {
  return typeof spreadsheetIdHash === "string" && spreadsheetIdHashPattern.test(spreadsheetIdHash)
    ? spreadsheetIdHash
    : undefined;
}

function selectSafeCounts(counts: SafeLogCounts | undefined): SafeLogCounts | undefined {
  if (counts === undefined) {
    return undefined;
  }

  const safeCounts: SafeLogCounts = {};

  for (const key of safeLogCountKeys) {
    const value = counts[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      safeCounts[key] = value;
    }
  }

  return Object.keys(safeCounts).length === 0 ? undefined : safeCounts;
}
