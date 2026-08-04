import type { sheets_v4 } from "googleapis";
import type { ErrorCode } from "../errors.js";
import { validateRanges } from "../sheets/range-policy.js";
import { assertResponseWithinLimits } from "../sheets/response-limits.js";
import { parseSpreadsheetRef, SheetsReaderValidationError } from "../sheets/spreadsheet-ref.js";
import { GoogleSheetsError, mapGoogleError, type GoogleOperation } from "./google-error-map.js";

type ValueMode = "typed" | "display" | "formula";
type Cell = string | number | boolean | null;

type Api = Pick<sheets_v4.Sheets, "spreadsheets">;

export class SheetsReaderError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "SheetsReaderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type SpreadsheetMetadata = {
  spreadsheetId: string;
  title: string;
  locale?: string;
  timeZone?: string;
  requestedGid?: number;
  tabs: Array<{ sheetId: number; title: string; index: number; rowCount: number; columnCount: number; hidden: boolean; requested: boolean }>;
};

export type ReadSampleInput = { spreadsheet: string; sheetName?: string; maxRows?: number; maxColumns?: number; valueMode?: ValueMode };
export type ReadRangesInput = { spreadsheet: string; ranges: string[]; valueMode?: ValueMode };

type Options = { sleep?: (milliseconds: number) => Promise<void>; now?: () => number };

function asReaderError(error: unknown): SheetsReaderError {
  if (error instanceof SheetsReaderError) return error;
  if (error instanceof SheetsReaderValidationError) return new SheetsReaderError(error.code, error.message, false);
  const mapped = error instanceof GoogleSheetsError ? error : mapGoogleError(error);
  return new SheetsReaderError(mapped.code, mapped.message, mapped.retryable);
}

function renderOptions(mode: ValueMode = "typed") {
  if (mode === "display") return { valueRenderOption: "FORMATTED_VALUE" as const };
  if (mode === "formula") return { valueRenderOption: "FORMULA" as const, dateTimeRenderOption: "FORMATTED_STRING" as const };
  return { valueRenderOption: "UNFORMATTED_VALUE" as const, dateTimeRenderOption: "FORMATTED_STRING" as const };
}

function normalizeValues(input: unknown): Cell[][] {
  if (!Array.isArray(input)) return [];
  return input.map((row) => Array.isArray(row) ? row.map((value) => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    return String(value);
  }) : []);
}

function countCells(values: Cell[][]): number {
  return values.reduce((sum, row) => sum + row.length, 0);
}

function quoteSheet(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function columnName(number: number): string {
  let value = number;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export class SheetsReader {
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly api: Api, options: Options = {}) {
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
  }

  private async readWithRetry<T>(operationType: GoogleOperation, operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const mapped = mapGoogleError(error, this.now(), operationType);
        if (!mapped.retryable || attempt === 2) throw asReaderError(mapped);
        await this.sleep(mapped.retryAfterMs ?? 250 * (2 ** attempt));
      }
    }
    throw new SheetsReaderError("GOOGLE_API_ERROR", "Google Sheets returned an unexpected error.");
  }

  async getMetadata(reference: string): Promise<SpreadsheetMetadata> {
    let ref;
    try { ref = parseSpreadsheetRef(reference); } catch (error) { throw asReaderError(error); }
    const response = await this.readWithRetry("metadata", () => this.api.spreadsheets.get({
      spreadsheetId: ref.spreadsheetId,
      includeGridData: false,
      fields: "spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))"
    }, { retry: false }));
    const data = response.data;
    const tabs = (data.sheets ?? []).map((sheet) => {
      const properties = sheet.properties ?? {};
      return {
        sheetId: properties.sheetId ?? 0,
        title: properties.title ?? "",
        index: properties.index ?? 0,
        rowCount: properties.gridProperties?.rowCount ?? 0,
        columnCount: properties.gridProperties?.columnCount ?? 0,
        hidden: properties.hidden ?? false,
        requested: ref.requestedGid !== undefined && properties.sheetId === ref.requestedGid
      };
    });
    const result: SpreadsheetMetadata = {
      spreadsheetId: data.spreadsheetId ?? ref.spreadsheetId,
      title: data.properties?.title ?? "",
      ...(data.properties?.locale ? { locale: data.properties.locale } : {}),
      ...(data.properties?.timeZone ? { timeZone: data.properties.timeZone } : {}),
      ...(ref.requestedGid !== undefined ? { requestedGid: ref.requestedGid } : {}),
      tabs
    };
    assertResponseWithinLimits(result, 0);
    return result;
  }

  async readSample(input: ReadSampleInput) {
    const maxRows = input.maxRows ?? 50;
    const maxColumns = input.maxColumns ?? 25;
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 200 || !Number.isInteger(maxColumns) || maxColumns < 1 || maxColumns > 50) {
      throw new SheetsReaderError("INVALID_RANGE", "Sample bounds are invalid.");
    }
    const metadata = await this.getMetadata(input.spreadsheet);
    let tab = input.sheetName ? metadata.tabs.find((candidate) => candidate.title === input.sheetName) : metadata.tabs.find((candidate) => candidate.requested);
    if (!tab && !input.sheetName) {
      const visible = metadata.tabs.filter((candidate) => !candidate.hidden);
      if (visible.length > 1) throw new SheetsReaderError("SHEET_SELECTION_REQUIRED", `Choose one sheet: ${visible.map((item) => item.title).join(", ")}.`);
      tab = visible[0];
    }
    if (!tab) throw new SheetsReaderError("SHEET_NOT_FOUND", "The requested sheet tab was not found.");
    const requestedRange = `${quoteSheet(tab.title)}!A1:${columnName(maxColumns)}${maxRows}`;
    const response = await this.readWithRetry("range", () => this.api.spreadsheets.values.get({
      spreadsheetId: metadata.spreadsheetId,
      range: requestedRange,
      majorDimension: "ROWS",
      ...renderOptions(input.valueMode)
    }, { retry: false }));
    const values = normalizeValues(response.data.values);
    const returnedRows = values.length;
    const returnedColumns = values.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    const result = {
      spreadsheetId: metadata.spreadsheetId,
      spreadsheetTitle: metadata.title,
      sheetId: tab.sheetId,
      sheetName: tab.title,
      range: response.data.range ?? requestedRange,
      values,
      returnedRows,
      returnedColumns,
      truncated: tab.rowCount > maxRows || tab.columnCount > maxColumns
    };
    assertResponseWithinLimits(result, countCells(values));
    return result;
  }

  async readRanges(input: ReadRangesInput) {
    let ref;
    let ranges;
    try {
      ref = parseSpreadsheetRef(input.spreadsheet);
      ranges = validateRanges(input.ranges);
    } catch (error) { throw asReaderError(error); }
    const response = await this.readWithRetry("range", () => this.api.spreadsheets.values.batchGet({
      spreadsheetId: ref.spreadsheetId,
      ranges,
      majorDimension: "ROWS",
      ...renderOptions(input.valueMode)
    }, { retry: false }));
    const valueRanges = response.data.valueRanges ?? [];
    const outputRanges = ranges.map((requestedRange, index) => {
      const valueRange = valueRanges[index] ?? {};
      return { requestedRange, resolvedRange: valueRange.range ?? requestedRange, values: normalizeValues(valueRange.values) };
    });
    const totalCells = outputRanges.reduce((sum, item) => sum + countCells(item.values), 0);
    const result = { spreadsheetId: response.data.spreadsheetId ?? ref.spreadsheetId, ranges: outputRanges, totalCells };
    assertResponseWithinLimits(result, totalCells);
    return result;
  }
}
