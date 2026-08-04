import { describe, expect, it } from "vitest";
import { assertResponseWithinLimits } from "../../src/sheets/response-limits.js";

function expectResponseLimitError(value: unknown, cellCount: number): Error {
  let caught: unknown;

  try {
    assertResponseWithinLimits(value, cellCount);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ code: "RESPONSE_LIMIT_EXCEEDED" });

  return caught as Error;
}

describe("assertResponseWithinLimits", () => {
  it("allows exactly 20,000 cells", () => {
    expect(() => assertResponseWithinLimits({ values: [["ok"]] }, 20_000)).not.toThrow();
  });

  it("rejects 20,001 cells", () => {
    expectResponseLimitError({ values: [["ok"]] }, 20_001);
  });

  it("allows a serialized JSON string exactly 2 MiB", () => {
    const valueAtLimit = "x".repeat(2 * 1024 * 1024 - 2);

    expect(() => assertResponseWithinLimits(valueAtLimit, 1)).not.toThrow();
  });

  it("rejects a serialized JSON payload over 2 MiB without echoing it", () => {
    const oversizedValue = "x".repeat(2 * 1024 * 1024);
    const error = expectResponseLimitError(oversizedValue, 1);

    expect(error.message).not.toContain(oversizedValue);
  });
});
