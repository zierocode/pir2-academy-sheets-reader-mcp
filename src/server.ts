import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { loadDesktopCredentials } from "./auth/credential-file.js";
import {
  createProductionGoogleOAuthDependencies,
  GoogleOAuthCoordinator,
  GoogleOAuthError,
  type AuthStatus,
  type DesktopCredentialsProvider
} from "./auth/google-oauth.js";
import { KeyringTokenStore } from "./auth/token-store-keyring.js";
import {
  normalizeStoredGoogleToken,
  type StoredGoogleToken,
  type TokenStore
} from "./auth/token-store.js";
import { failure, success, type Failure, type Success } from "./contracts.js";
import type { ErrorCode } from "./errors.js";
import { SheetsReader } from "./google/sheets-client.js";
import {
  hashSpreadsheetId,
  writeDiagnostic,
  type SafeLogCounts,
  type SafeLogEvent,
  type SafeLogTool
} from "./logging.js";
import { createAuthStatusTool } from "./tools/auth-status.js";
import { createConnectGoogleTool } from "./tools/connect-google.js";
import { createGetSpreadsheetMetadataTool } from "./tools/get-spreadsheet-metadata.js";
import { createReadSheetRangesTool } from "./tools/read-sheet-ranges.js";
import { createReadSheetSampleTool } from "./tools/read-sheet-sample.js";
import { z } from "zod";

const ERROR_CODES = new Set<ErrorCode>([
  "CREDENTIALS_NOT_CONFIGURED",
  "INVALID_CREDENTIAL_FILE",
  "AUTH_REQUIRED",
  "AUTH_RECONNECT_REQUIRED",
  "AUTH_CANCELLED",
  "AUTH_TIMEOUT",
  "TOKEN_STORE_UNAVAILABLE",
  "INVALID_SPREADSHEET_REFERENCE",
  "SPREADSHEET_NOT_FOUND_OR_FORBIDDEN",
  "SHEET_SELECTION_REQUIRED",
  "SHEET_NOT_FOUND",
  "INVALID_RANGE",
  "RESPONSE_LIMIT_EXCEEDED",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "GOOGLE_API_ERROR"
]);

type ToolName =
  | "google_auth_status"
  | "connect_google"
  | "get_spreadsheet_metadata"
  | "read_sheet_sample"
  | "read_sheet_ranges";

type SafeError = {
  message: string;
  userAction: string;
  retryable: boolean;
};

const SAFE_ERRORS: Record<ErrorCode, SafeError> = {
  CREDENTIALS_NOT_CONFIGURED: {
    message: "ยังไม่ได้ตั้งค่าไฟล์ Google OAuth ครับ",
    userAction: "เลือกไฟล์ Google Desktop OAuth credentials ที่ถูกต้อง แล้วลองอีกครั้งครับ",
    retryable: false
  },
  INVALID_CREDENTIAL_FILE: {
    message: "ไฟล์ Google OAuth ที่เลือกไม่ถูกต้องครับ",
    userAction: "เลือกไฟล์ Desktop OAuth credentials JSON จาก Google Cloud project ของคุณครับ",
    retryable: false
  },
  AUTH_REQUIRED: {
    message: "ต้องเชื่อม Google ก่อนอ่าน Sheet ครับ",
    userAction: "ยืนยันการเชื่อม Google แล้วทำขั้นตอนใน Browser ให้เสร็จครับ",
    retryable: false
  },
  AUTH_RECONNECT_REQUIRED: {
    message: "การเชื่อม Google หมดอายุครับ",
    userAction: "เชื่อม Google ใหม่ แล้วอนุญาตสิทธิ์อ่าน Sheet อีกครั้งครับ",
    retryable: false
  },
  AUTH_CANCELLED: {
    message: "ยกเลิกการเชื่อม Google แล้วครับ",
    userAction: "เมื่อพร้อม ให้เริ่มเชื่อม Google อีกครั้งครับ",
    retryable: false
  },
  AUTH_TIMEOUT: {
    message: "หมดเวลารอเชื่อม Google ครับ",
    userAction: "เริ่มเชื่อมใหม่และทำขั้นตอนใน Browser ให้เสร็จภายในสามนาทีครับ",
    retryable: true
  },
  TOKEN_STORE_UNAVAILABLE: {
    message: "ยังใช้ที่เก็บข้อมูลเข้าสู่ระบบของเครื่องไม่ได้ครับ",
    userAction: "ปลดล็อกที่เก็บรหัสผ่านของเครื่อง แล้วลองอีกครั้งครับ",
    retryable: false
  },
  INVALID_SPREADSHEET_REFERENCE: {
    message: "Google Sheets URL หรือ spreadsheet ID ไม่ถูกต้องครับ",
    userAction: "แปะ Google Sheets URL ที่ต้องการใช้อีกครั้งครับ",
    retryable: false
  },
  SPREADSHEET_NOT_FOUND_OR_FORBIDDEN: {
    message: "ไม่พบ Sheet นี้ หรือบัญชี Google ที่เชื่อมอยู่ไม่มีสิทธิ์ดูครับ",
    userAction: "ตรวจ URL และเชื่อมด้วยบัญชี Google ที่เปิด Sheet นี้ได้ครับ",
    retryable: false
  },
  SHEET_SELECTION_REQUIRED: {
    message: "มีหลาย Tab ที่อาจเป็นข้อมูลหลักครับ",
    userAction: "เลือก Tab ที่ต้องการใช้หนึ่ง Tab ครับ",
    retryable: false
  },
  SHEET_NOT_FOUND: {
    message: "ไม่พบ Tab ที่เลือกใน Sheet นี้ครับ",
    userAction: "เลือกชื่อ Tab ที่มีอยู่ใน Sheet ครับ",
    retryable: false
  },
  INVALID_RANGE: {
    message: "ช่วงข้อมูลที่ขออ่านไม่ถูกต้องครับ",
    userAction: "ตรวจชื่อ Tab และช่วงข้อมูล แล้วลองอีกครั้งครับ",
    retryable: false
  },
  RESPONSE_LIMIT_EXCEEDED: {
    message: "ข้อมูลที่ขออ่านมีขนาดใหญ่เกินขีดจำกัดครับ",
    userAction: "แบ่งอ่านเป็นช่วงที่เล็กลง แล้วลองอีกครั้งครับ",
    retryable: false
  },
  RATE_LIMITED: {
    message: "Google Sheets จำกัดการอ่านชั่วคราวครับ",
    userAction: "รอสักครู่ แล้วลองอ่านอีกครั้งครับ",
    retryable: true
  },
  NETWORK_ERROR: {
    message: "ยังเชื่อมต่อ Google Sheets ไม่ได้ครับ",
    userAction: "ตรวจอินเทอร์เน็ต แล้วลองอีกครั้งครับ",
    retryable: true
  },
  GOOGLE_API_ERROR: {
    message: "Google Sheets ตอบกลับผิดปกติครับ",
    userAction: "ลองอีกครั้ง หากยังไม่สำเร็จให้เชื่อม Google ใหม่ครับ",
    retryable: false
  }
};

export type ToolServices = {
  oauth: Pick<GoogleOAuthCoordinator, "start" | "status"> & { close?: () => Promise<void> };
  sheets: Pick<SheetsReader, "getMetadata" | "readSample" | "readRanges">;
};

export type ToolCallResult = {
  content: [{ type: "text"; text: string }];
  structuredContent: Success<unknown> | Failure;
  isError?: true;
};

export type ToolExecutionContext = {
  services: ToolServices;
  signal?: AbortSignal;
  success(data: unknown): ToolCallResult;
  failure(code: ErrorCode, retryable?: boolean): ToolCallResult;
  requireReadAuthorization(): Promise<ToolCallResult | undefined>;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType;
  handler(input: unknown, signal?: AbortSignal): Promise<ToolCallResult>;
};

export type UnboundToolDefinition = Omit<ToolDefinition, "handler"> & {
  handler(input: unknown, context: ToolExecutionContext): Promise<ToolCallResult>;
};

export type ToolCatalogOptions = {
  now?: () => string;
  requestId?: () => string;
  diagnostic?: (event: SafeLogEvent) => void;
};

export function buildServerIdentity(): { name: string; version: string } {
  return {
    name: "pir2-academy-sheets-reader",
    version: "0.1.2"
  };
}

export function createToolCatalog(
  services: ToolServices,
  options: ToolCatalogOptions = {}
): ToolDefinition[] {
  const now = options.now ?? (() => new Date().toISOString());
  const requestId = options.requestId ?? randomUUID;
  const diagnostic = options.diagnostic ?? writeDiagnostic;
  const definitions: UnboundToolDefinition[] = [
    createAuthStatusTool(),
    createConnectGoogleTool(),
    createGetSpreadsheetMetadataTool(),
    createReadSheetSampleTool(),
    createReadSheetRangesTool()
  ];

  return definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    handler: async (input: unknown, signal?: AbortSignal) => {
      const id = requestId();
      const startedAt = Date.now();
      const context = createToolExecutionContext(services, id, now, signal);
      let result: ToolCallResult;

      try {
        result = await definition.handler(input, context);
      } catch (error) {
        result = context.failure(errorCodeOf(error), retryableOf(error));
      }

      writeSafeDiagnostic(diagnostic, definition.name, id, Date.now() - startedAt, result);
      return result;
    }
  }));
}

export function createMcpServer(
  services: ToolServices,
  options: ToolCatalogOptions = {}
): Server {
  const catalog = createToolCatalog(services, options);
  const server = new Server(buildServerIdentity(), { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: catalog.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema)
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = catalog.find((candidate) => candidate.name === request.params.name);

    return tool
      ? tool.handler(request.params.arguments ?? {}, extra.signal)
      : failureResult("GOOGLE_API_ERROR", randomUUID());
  });

  return server;
}

export function createEnvironmentCredentialProvider(
  environment: NodeJS.ProcessEnv = process.env
): DesktopCredentialsProvider {
  return {
    get: async () => {
      const credentialPath = environment.GOOGLE_OAUTH_CREDENTIALS_FILE?.trim();

      if (!credentialPath) {
        return null;
      }

      return loadDesktopCredentials(credentialPath);
    }
  };
}

export function createProductionToolServices(
  environment: NodeJS.ProcessEnv = process.env
): ToolServices {
  const credentialProvider = createEnvironmentCredentialProvider(environment);
  const tokenStore = new KeyringTokenStore();
  const oauth = new GoogleOAuthCoordinator(
    createProductionGoogleOAuthDependencies({ credentialProvider, tokenStore })
  );

  return {
    oauth,
    sheets: createAuthorizedSheetsService(oauth, credentialProvider, tokenStore)
  };
}

export function createProductionMcpServer(
  environment: NodeJS.ProcessEnv = process.env
): Server {
  return createMcpServer(createProductionToolServices(environment));
}

export function installInputShutdownHandlers(
  input: NodeJS.ReadableStream,
  close: () => Promise<void>
): () => void {
  const closeOnInput = (): void => {
    void close();
  };

  input.once("end", closeOnInput);
  input.once("close", closeOnInput);

  return () => {
    input.off("end", closeOnInput);
    input.off("close", closeOnInput);
  };
}

export async function runStdioServer(
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const services = createProductionToolServices(environment);
  const server = createMcpServer(services);
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      await services.oauth.close?.();
      await server.close();
    })();
    return closing;
  };
  const closeOnSignal = (): void => {
    void close().finally(() => {
      process.exitCode = 0;
    });
  };

  process.once("SIGINT", closeOnSignal);
  process.once("SIGTERM", closeOnSignal);
  const removeInputShutdownHandlers = installInputShutdownHandlers(process.stdin, close);
  transport.onclose = () => {
    process.off("SIGINT", closeOnSignal);
    process.off("SIGTERM", closeOnSignal);
    removeInputShutdownHandlers();
    void close();
  };

  await server.connect(transport);
}

function createToolExecutionContext(
  services: ToolServices,
  requestId: string,
  now: () => string,
  signal: AbortSignal | undefined
): ToolExecutionContext {
  return {
    services,
    signal,
    success: (data) => successResult(data, requestId, now()),
    failure: (code, retryable) => failureResult(code, requestId, retryable),
    requireReadAuthorization: async () => {
      let status: AuthStatus;

      try {
        status = await services.oauth.status();
      } catch (error) {
        return failureResult(errorCodeOf(error), requestId, retryableOf(error));
      }

      if (!status.credentialsConfigured || status.status === "not_configured") {
        if (status.status === "failed" && status.lastErrorCode && ERROR_CODES.has(status.lastErrorCode)) {
          return failureResult(status.lastErrorCode, requestId);
        }
        return failureResult("CREDENTIALS_NOT_CONFIGURED", requestId);
      }

      if (status.status === "failed" && status.lastErrorCode && ERROR_CODES.has(status.lastErrorCode)) {
        return failureResult(status.lastErrorCode, requestId);
      }

      if (status.status === "reconnect_required") {
        return failureResult("AUTH_RECONNECT_REQUIRED", requestId);
      }

      if (status.status !== "connected" || !status.scopeGranted) {
        return failureResult("AUTH_REQUIRED", requestId);
      }

      return undefined;
    }
  };
}

function successResult(data: unknown, requestId: string, retrievedAt: string): ToolCallResult {
  const envelope = success(data, requestId, retrievedAt);

  return {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
    structuredContent: envelope
  };
}

function failureResult(
  code: ErrorCode,
  requestId: string,
  retryable = SAFE_ERRORS[code].retryable
): ToolCallResult {
  const detail = SAFE_ERRORS[code];
  const envelope = failure(
    {
      code,
      message: detail.message,
      userAction: detail.userAction,
      retryable
    },
    requestId
  );

  return {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
    structuredContent: envelope,
    isError: true
  };
}

function errorCodeOf(error: unknown): ErrorCode {
  const candidate = error instanceof Error && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;

  return typeof candidate === "string" && ERROR_CODES.has(candidate as ErrorCode)
    ? candidate as ErrorCode
    : "GOOGLE_API_ERROR";
}

function retryableOf(error: unknown): boolean | undefined {
  const candidate = error instanceof Error && "retryable" in error
    ? (error as { retryable?: unknown }).retryable
    : undefined;

  return typeof candidate === "boolean" ? candidate : undefined;
}

function writeSafeDiagnostic(
  diagnostic: (event: SafeLogEvent) => void,
  tool: ToolName,
  requestId: string,
  durationMs: number,
  result: ToolCallResult
): void {
  const event: SafeLogEvent = {
    requestId,
    tool: tool as SafeLogTool,
    durationMs: Math.max(0, durationMs),
    status: result.structuredContent.ok ? "success" : "failure"
  };
  const successData = result.structuredContent.ok ? result.structuredContent.data : undefined;
  const spreadsheetId = safeSpreadsheetId(successData);
  const counts = safeCounts(successData);

  if (spreadsheetId) {
    event.spreadsheetIdHash = hashSpreadsheetId(spreadsheetId);
  }

  if (counts) {
    event.counts = counts;
  }

  try {
    diagnostic(event);
  } catch {
    // Diagnostics cannot affect the MCP response or write to stdout.
  }
}

function safeSpreadsheetId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const spreadsheetId = (data as { spreadsheetId?: unknown }).spreadsheetId;
  return typeof spreadsheetId === "string" && spreadsheetId.length > 0 ? spreadsheetId : undefined;
}

function safeCounts(data: unknown): SafeLogCounts | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const counts: SafeLogCounts = {};
  const tabs = Array.isArray(record.tabs) ? record.tabs.length : undefined;
  const ranges = Array.isArray(record.ranges) ? record.ranges.length : undefined;
  const rows = record.returnedRows;
  const columns = record.returnedColumns;
  const cells = record.totalCells;

  if (typeof tabs === "number") counts.tabs = tabs;
  if (typeof ranges === "number") counts.ranges = ranges;
  if (typeof rows === "number" && Number.isFinite(rows)) counts.rows = rows;
  if (typeof columns === "number" && Number.isFinite(columns)) counts.columns = columns;
  if (typeof cells === "number" && Number.isFinite(cells)) counts.cells = cells;

  return Object.keys(counts).length > 0 ? counts : undefined;
}

function createAuthorizedSheetsService(
  oauth: Pick<GoogleOAuthCoordinator, "status">,
  credentialProvider: DesktopCredentialsProvider,
  tokenStore: TokenStore
): ToolServices["sheets"] {
  return {
    getMetadata: async (reference) => withAuthorizedSheetsReader(
      oauth,
      credentialProvider,
      tokenStore,
      (reader) => reader.getMetadata(reference)
    ),
    readSample: async (input) => withAuthorizedSheetsReader(
      oauth,
      credentialProvider,
      tokenStore,
      (reader) => reader.readSample(input)
    ),
    readRanges: async (input) => withAuthorizedSheetsReader(
      oauth,
      credentialProvider,
      tokenStore,
      (reader) => reader.readRanges(input)
    )
  };
}

async function withAuthorizedSheetsReader<Result>(
  oauth: Pick<GoogleOAuthCoordinator, "status">,
  credentialProvider: DesktopCredentialsProvider,
  tokenStore: TokenStore,
  operation: (reader: SheetsReader) => Promise<Result>
): Promise<Result> {
  const status = await oauth.status();
  assertConnected(status);
  const credentials = await credentialProvider.get();

  if (!credentials) {
    throw new GoogleOAuthError("CREDENTIALS_NOT_CONFIGURED");
  }

  const token = await tokenStore.get(credentials.clientId);

  if (!token) {
    throw new GoogleOAuthError("AUTH_REQUIRED");
  }

  const client = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUris[0]
  );
  client.setCredentials(toGoogleCredentials(token));
  client.on("tokens", (tokens) => {
    const updated = mergeGoogleToken(token, tokens);

    if (updated) {
      void tokenStore.set(credentials.clientId, updated).catch(() => undefined);
    }
  });

  return operation(new SheetsReader(google.sheets({ version: "v4", auth: client })));
}

function assertConnected(status: AuthStatus): void {
  if (!status.credentialsConfigured || status.status === "not_configured") {
    throw new GoogleOAuthError("CREDENTIALS_NOT_CONFIGURED");
  }

  if (status.status === "reconnect_required") {
    throw new GoogleOAuthError("AUTH_RECONNECT_REQUIRED");
  }

  if (status.status !== "connected" || !status.scopeGranted) {
    throw new GoogleOAuthError("AUTH_REQUIRED");
  }
}

function toGoogleCredentials(token: StoredGoogleToken): {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
} {
  return {
    ...(token.accessToken === undefined ? {} : { access_token: token.accessToken }),
    ...(token.refreshToken === undefined ? {} : { refresh_token: token.refreshToken }),
    ...(token.scope === undefined ? {} : { scope: token.scope }),
    ...(token.tokenType === undefined ? {} : { token_type: token.tokenType }),
    ...(token.expiryDate === undefined ? {} : { expiry_date: token.expiryDate })
  };
}

function mergeGoogleToken(
  previous: StoredGoogleToken,
  refreshed: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string | null;
    token_type?: string | null;
    expiry_date?: number | null;
  }
): StoredGoogleToken | undefined {
  return normalizeStoredGoogleToken({
    ...(previous.accessToken === undefined ? {} : { accessToken: previous.accessToken }),
    ...(previous.refreshToken === undefined ? {} : { refreshToken: previous.refreshToken }),
    ...(previous.scope === undefined ? {} : { scope: previous.scope }),
    ...(previous.tokenType === undefined ? {} : { tokenType: previous.tokenType }),
    ...(previous.expiryDate === undefined ? {} : { expiryDate: previous.expiryDate }),
    ...(typeof refreshed.access_token === "string" ? { accessToken: refreshed.access_token } : {}),
    ...(typeof refreshed.refresh_token === "string" ? { refreshToken: refreshed.refresh_token } : {}),
    ...(typeof refreshed.scope === "string" ? { scope: refreshed.scope } : {}),
    ...(typeof refreshed.token_type === "string" ? { tokenType: refreshed.token_type } : {}),
    ...(typeof refreshed.expiry_date === "number" ? { expiryDate: refreshed.expiry_date } : {})
  });
}
