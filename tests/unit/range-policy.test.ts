import { describe, expect, it } from "vitest";
import { validateRanges } from "../../src/sheets/range-policy.js";

function expectRangeError(ranges: string[]): Error {
  let caught: unknown;

  try {
    validateRanges(ranges);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ code: "INVALID_RANGE" });

  return caught as Error;
}

describe("validateRanges", () => {
  it("returns valid explicit A1 ranges unchanged", () => {
    const ranges = ["Overview!A1:C10", "'Q1 sales'!B2:B8"];

    expect(validateRanges(ranges)).toEqual(ranges);
  });

  it.each([
    ["no ranges", []],
    ["more than ten ranges", Array.from({ length: 11 }, (_, index) => `Sheet1!A${index + 1}`)]
  ])("rejects %s", (_caseName, ranges) => {
    expectRangeError(ranges);
  });

  it("rejects an A1 range over 200 characters without echoing it", () => {
    const overlongRange = "A".repeat(201);
    const error = expectRangeError([overlongRange]);

    expect(error.message).not.toContain(overlongRange);
  });
});
