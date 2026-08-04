import { describe, expect, it } from "vitest";
import { parseSpreadsheetRef } from "../../src/sheets/spreadsheet-ref.js";

const SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

function expectReferenceError(input: string): Error {
  let caught: unknown;

  try {
    parseSpreadsheetRef(input);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ code: "INVALID_SPREADSHEET_REFERENCE" });

  return caught as Error;
}

describe("parseSpreadsheetRef", () => {
  it.each([
    [
      "a canonical Sheets URL",
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
      { spreadsheetId: SPREADSHEET_ID }
    ],
    [
      "a canonical Sheets URL with a gid fragment",
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=42`,
      { spreadsheetId: SPREADSHEET_ID, requestedGid: 42 }
    ],
    [
      "a Drive open URL with an id query parameter",
      `https://drive.google.com/open?id=${SPREADSHEET_ID}`,
      { spreadsheetId: SPREADSHEET_ID }
    ],
    ["a bare spreadsheet ID", SPREADSHEET_ID, { spreadsheetId: SPREADSHEET_ID }]
  ])("extracts the spreadsheet ID from %s", (_caseName, input, expected) => {
    expect(parseSpreadsheetRef(input)).toEqual(expected);
  });

  it("extracts a gid query parameter from a Drive open URL", () => {
    expect(
      parseSpreadsheetRef(`https://drive.google.com/open?id=${SPREADSHEET_ID}&gid=0`)
    ).toEqual({ spreadsheetId: SPREADSHEET_ID, requestedGid: 0 });
  });

  it.each([
    ["a malformed Sheets URL", "https://docs.google.com/spreadsheets/d//edit"],
    [
      "a URL on a non-Google host",
      `https://example.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
    ],
    [
      "a non-HTTPS Sheets URL",
      `http://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
    ],
    [
      "a URL with a malformed gid",
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=-1`
    ],
    ["an overlong reference", "x".repeat(2049)]
  ])("rejects %s without echoing the input", (_caseName, input) => {
    const error = expectReferenceError(input);

    expect(error.message).not.toContain(input);
  });
});
