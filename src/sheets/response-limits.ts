import { Buffer } from "node:buffer";
import { SheetsReaderValidationError } from "./spreadsheet-ref.js";

const MAX_CELLS = 20_000;
const MAX_SERIALIZED_RESPONSE_BYTES = 2 * 1024 * 1024;

function responseLimitExceeded(): never {
  throw new SheetsReaderValidationError(
    "RESPONSE_LIMIT_EXCEEDED",
    "The response exceeds the supported limit. Request smaller ranges and try again."
  );
}

export function assertResponseWithinLimits(value: unknown, cellCount: number): void {
  if (!Number.isSafeInteger(cellCount) || cellCount < 0 || cellCount > MAX_CELLS) {
    return responseLimitExceeded();
  }

  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(value);
  } catch {
    return responseLimitExceeded();
  }

  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, "utf8") > MAX_SERIALIZED_RESPONSE_BYTES
  ) {
    return responseLimitExceeded();
  }
}
