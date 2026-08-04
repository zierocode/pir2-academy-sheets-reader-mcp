import { describe, expect, it } from "vitest";
import { mapGoogleError } from "../../src/google/google-error-map.js";

function googleError(code: number, reason?: string, retryAfter?: string): unknown {
  return {
    code,
    response: {
      status: code,
      headers: retryAfter ? { "retry-after": retryAfter } : {},
      data: { error: { errors: reason ? [{ reason }] : [] } }
    }
  };
}

describe("mapGoogleError", () => {
  it("maps authentication and ambiguous access failures safely", () => {
    expect(mapGoogleError(googleError(401))).toMatchObject({ code: "AUTH_RECONNECT_REQUIRED", retryable: false });
    expect(mapGoogleError(googleError(403, "forbidden"))).toMatchObject({ code: "SPREADSHEET_NOT_FOUND_OR_FORBIDDEN", retryable: false });
    expect(mapGoogleError(googleError(404))).toMatchObject({ code: "SPREADSHEET_NOT_FOUND_OR_FORBIDDEN", retryable: false });
  });

  it("maps retryable quota responses and Retry-After", () => {
    expect(mapGoogleError(googleError(403, "rateLimitExceeded"))).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(mapGoogleError(googleError(429, undefined, "3"))).toMatchObject({ code: "RATE_LIMITED", retryable: true, retryAfterMs: 3000 });
  });

  it("maps invalid A1, network, and unknown failures", () => {
    expect(mapGoogleError(googleError(400, "badRequest"), Date.now(), "range")).toMatchObject({ code: "INVALID_RANGE", retryable: false });
    expect(mapGoogleError(googleError(400, "badRequest"), Date.now(), "metadata")).toMatchObject({ code: "GOOGLE_API_ERROR", retryable: false });
    expect(mapGoogleError(Object.assign(new Error("offline"), { code: "ENOTFOUND" }))).toMatchObject({ code: "NETWORK_ERROR", retryable: false });
    expect(mapGoogleError(new Error("secret upstream text"))).toMatchObject({ code: "GOOGLE_API_ERROR", retryable: false });
    expect(mapGoogleError(new Error("secret upstream text")).message).not.toContain("secret");
  });

  it("reads real Headers Retry-After values and caps excessive delays", () => {
    const error = { code: 429, response: { status: 429, headers: new Headers({ "Retry-After": "999" }), data: { error: { errors: [] } } } };
    expect(mapGoogleError(error)).toMatchObject({ retryAfterMs: 30_000 });
    const now = Date.parse("2026-08-04T00:00:00Z");
    const dated = { code: 429, response: { status: 429, headers: new Headers({ "Retry-After": "Tue, 04 Aug 2026 00:00:03 GMT" }), data: { error: { errors: [] } } } };
    expect(mapGoogleError(dated, now)).toMatchObject({ retryAfterMs: 3000 });
  });
});
