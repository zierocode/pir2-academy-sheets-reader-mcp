import type { ErrorCode } from "./errors.js";

export type Success<Data> = {
  ok: true;
  data: Data;
  meta: {
    requestId: string;
    retrievedAt: string;
  };
};

export type Failure = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    userAction: string;
    retryable: boolean;
  };
  meta: {
    requestId: string;
  };
};

export function success<Data>(data: Data, requestId: string, retrievedAt: string): Success<Data> {
  return {
    ok: true,
    data,
    meta: {
      requestId,
      retrievedAt
    }
  };
}

export function failure(error: Failure["error"], requestId: string): Failure {
  return {
    ok: false,
    error,
    meta: {
      requestId
    }
  };
}
