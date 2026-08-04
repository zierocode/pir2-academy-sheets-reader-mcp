import type { ErrorCode } from "../errors.js";

export class GoogleSheetsError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(code: ErrorCode, message: string, retryable: boolean, retryAfterMs?: number) {
    super(message);
    this.name = "GoogleSheetsError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

type GoogleErrorShape = {
  code?: unknown;
  response?: {
    status?: unknown;
    headers?: unknown;
    data?: { error?: { errors?: Array<{ reason?: unknown }> } };
  };
};

export type GoogleOperation = "generic" | "metadata" | "range";
const MAX_RETRY_DELAY_MS = 30_000;

const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "RESOURCE_EXHAUSTED"
]);

function statusOf(error: GoogleErrorShape): number | undefined {
  const candidate = error.response?.status ?? error.code;
  return typeof candidate === "number" ? candidate : undefined;
}

function reasonOf(error: GoogleErrorShape): string | undefined {
  const reason = error.response?.data?.error?.errors?.[0]?.reason;
  return typeof reason === "string" ? reason : undefined;
}

function retryAfterOf(error: GoogleErrorShape, nowMs: number): number | undefined {
  const headers = error.response?.headers;
  if (!headers || typeof headers !== "object") return undefined;
  const getter = (headers as { get?: (name: string) => unknown }).get;
  const record = headers as Record<string, unknown>;
  const raw = typeof getter === "function"
    ? getter.call(headers, "retry-after")
    : record["retry-after"] ?? record["Retry-After"];
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const value = String(raw).trim();
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, Number(value) * 1000));
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.min(MAX_RETRY_DELAY_MS, Math.max(0, dateMs - nowMs)) : undefined;
}

export function mapGoogleError(error: unknown, nowMs = Date.now(), operation: GoogleOperation = "generic"): GoogleSheetsError {
  if (error instanceof GoogleSheetsError) return error;
  const shape = (error && typeof error === "object" ? error : {}) as GoogleErrorShape;
  const status = statusOf(shape);
  const reason = reasonOf(shape);

  if (status === 401) {
    return new GoogleSheetsError("AUTH_RECONNECT_REQUIRED", "Reconnect Google and try again.", false);
  }
  if (status === 429 || (status === 403 && reason !== undefined && QUOTA_REASONS.has(reason))) {
    return new GoogleSheetsError("RATE_LIMITED", "Google Sheets is temporarily rate limited. Try again shortly.", true, retryAfterOf(shape, nowMs));
  }
  if (status === 403 || status === 404) {
    return new GoogleSheetsError("SPREADSHEET_NOT_FOUND_OR_FORBIDDEN", "The spreadsheet was not found or this Google account cannot access it.", false);
  }
  if (status === 400 && operation === "range") {
    return new GoogleSheetsError("INVALID_RANGE", "One or more A1 ranges are invalid.", false);
  }
  const code = typeof shape.code === "string" ? shape.code : undefined;
  if (code && new Set(["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"]).has(code)) {
    return new GoogleSheetsError("NETWORK_ERROR", "Google Sheets could not be reached. Check the network and try again.", false);
  }
  return new GoogleSheetsError("GOOGLE_API_ERROR", "Google Sheets returned an unexpected error.", false);
}
