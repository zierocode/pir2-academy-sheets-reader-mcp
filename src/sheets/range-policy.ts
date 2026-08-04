import { SheetsReaderValidationError } from "./spreadsheet-ref.js";

const MAX_RANGES = 10;
const MAX_RANGE_LENGTH = 200;

function invalidRange(): never {
  throw new SheetsReaderValidationError(
    "INVALID_RANGE",
    "Provide between 1 and 10 A1 ranges, each no longer than 200 characters."
  );
}

export function validateRanges(ranges: string[]): string[] {
  if (ranges.length === 0 || ranges.length > MAX_RANGES) {
    return invalidRange();
  }

  for (const range of ranges) {
    if (typeof range !== "string" || range.length === 0 || range.length > MAX_RANGE_LENGTH) {
      return invalidRange();
    }
  }

  return [...ranges];
}
