import { describe, expect, it } from "vitest";
import { buildServerIdentity } from "../../src/index.js";

describe("server identity", () => {
  it("uses the stable PiR2 Academy Sheets Reader identity", () => {
    expect(buildServerIdentity()).toEqual({
      name: "pir2-academy-sheets-reader",
      version: "0.1.3"
    });
  });
});
