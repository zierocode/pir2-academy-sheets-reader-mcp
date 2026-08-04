import type { ErrorCode } from "../errors.js";

const MAX_REFERENCE_LENGTH = 2048;
const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;
const GID_PATTERN = /^(?:0|[1-9][0-9]*)$/;

type ValidationErrorCode = Extract<
  ErrorCode,
  "INVALID_SPREADSHEET_REFERENCE" | "INVALID_RANGE" | "RESPONSE_LIMIT_EXCEEDED"
>;

export class SheetsReaderValidationError extends Error {
  readonly code: ValidationErrorCode;

  constructor(code: ValidationErrorCode, message: string) {
    super(message);
    this.name = "SheetsReaderValidationError";
    this.code = code;
  }
}

export type SpreadsheetRef = {
  spreadsheetId: string;
  requestedGid?: number;
};

function invalidSpreadsheetReference(): never {
  throw new SheetsReaderValidationError(
    "INVALID_SPREADSHEET_REFERENCE",
    "The spreadsheet reference is invalid."
  );
}

function isSpreadsheetId(value: string): boolean {
  return SPREADSHEET_ID_PATTERN.test(value);
}

function parseRequestedGid(url: URL): number | undefined {
  const queryGids = url.searchParams.getAll("gid");
  const fragmentGids = new URLSearchParams(url.hash.slice(1)).getAll("gid");
  const gids = [...queryGids, ...fragmentGids];

  if (gids.length === 0) {
    return undefined;
  }

  if (gids.length !== 1 || !GID_PATTERN.test(gids[0])) {
    return invalidSpreadsheetReference();
  }

  const requestedGid = Number(gids[0]);

  if (!Number.isSafeInteger(requestedGid)) {
    return invalidSpreadsheetReference();
  }

  return requestedGid;
}

function parseSheetsUrl(url: URL): string | undefined {
  if (url.hostname !== "docs.google.com") {
    return undefined;
  }

  const match = /^\/spreadsheets\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname);

  return match?.[1];
}

function parseDriveOpenUrl(url: URL): string | undefined {
  if (url.hostname !== "drive.google.com") {
    return undefined;
  }

  if (!/^\/(?:drive\/u\/[0-9]+\/)?open$/.test(url.pathname)) {
    return undefined;
  }

  const ids = url.searchParams.getAll("id");

  return ids.length === 1 ? ids[0] : undefined;
}

export function parseSpreadsheetRef(input: string): SpreadsheetRef {
  if (
    input.length === 0 ||
    input.length > MAX_REFERENCE_LENGTH ||
    input.trim() !== input
  ) {
    return invalidSpreadsheetReference();
  }

  if (isSpreadsheetId(input)) {
    return { spreadsheetId: input };
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return invalidSpreadsheetReference();
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    return invalidSpreadsheetReference();
  }

  const requestedGid = parseRequestedGid(url);
  const spreadsheetId = parseSheetsUrl(url) ?? parseDriveOpenUrl(url);

  if (!spreadsheetId || !isSpreadsheetId(spreadsheetId)) {
    return invalidSpreadsheetReference();
  }

  return requestedGid === undefined ? { spreadsheetId } : { spreadsheetId, requestedGid };
}
