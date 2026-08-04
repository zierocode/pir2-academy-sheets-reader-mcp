import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import open from "open";
import { createOAuthState, createPkce } from "./pkce.js";
import type { DesktopCredentials } from "./credential-file.js";
import {
  TokenStoreUnavailableError,
  type StoredGoogleToken,
  type TokenStore
} from "./token-store.js";
import type { ErrorCode } from "../errors.js";

export const GOOGLE_SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";

const AUTHORIZATION_TIMEOUT_MS = 180_000;
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;

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

export type AuthStatus = {
  credentialsConfigured: boolean;
  status:
    | "not_configured"
    | "disconnected"
    | "waiting_for_authorization"
    | "connected"
    | "reconnect_required"
    | "failed";
  projectId?: string;
  scopeGranted: boolean;
  tokenExpiresAt?: string;
  authorizationExpiresAt?: string;
  lastErrorCode?: ErrorCode;
};

type PendingConnectGoogleResult = {
  authorizationStarted: true;
  status: "waiting_for_authorization";
  projectId: string;
  authorizationExpiresAt: string;
};

type ConnectedGoogleResult = {
  authorizationStarted: true;
  status: "connected";
  projectId: string;
  scopeGranted: boolean;
  tokenExpiresAt?: string;
};

export type ConnectGoogleResult = PendingConnectGoogleResult | ConnectedGoogleResult;

export type StartGoogleOptions = {
  waitForAuthorization?: boolean;
  signal?: AbortSignal;
};

export type DesktopCredentialsProvider = {
  get(): Promise<DesktopCredentials | null>;
};

export type BrowserOpener = {
  open(authorizationUrl: string): Promise<void>;
};

export type OAuthClock = {
  now(): number;
};

export type OAuthTimers = {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
};

export type LoopbackCallback = {
  query: URLSearchParams;
  respond(html: string): void;
};

export type LoopbackListenerRequest = {
  host: "127.0.0.1";
  port: 0;
  onCallback(callback: LoopbackCallback): Promise<void>;
};

export type LoopbackListener = {
  redirectUri: string;
  close(): Promise<void>;
};

export type LoopbackListenerFactory = {
  listen(request: LoopbackListenerRequest): Promise<LoopbackListener>;
};

export type AuthorizationCodeExchange = {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  tokenUri: string;
  signal: AbortSignal;
};

export type RefreshTokenExchange = {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  tokenUri: string;
  signal: AbortSignal;
};

export type GoogleTokenClient = {
  exchangeAuthorizationCode(input: AuthorizationCodeExchange): Promise<StoredGoogleToken>;
  refreshAccessToken(input: RefreshTokenExchange): Promise<StoredGoogleToken>;
};

export type GoogleOAuthDependencies = {
  credentialProvider: DesktopCredentialsProvider;
  tokenStore: TokenStore;
  browser: BrowserOpener;
  clock: OAuthClock;
  timers: OAuthTimers;
  listener: LoopbackListenerFactory;
  tokenClient: GoogleTokenClient;
};

export type GoogleTokenClientOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  requestTimeoutMs?: number;
  timers?: OAuthTimers;
};

export type ProductionGoogleOAuthDependenciesOptions = {
  credentialProvider: DesktopCredentialsProvider;
  tokenStore: TokenStore;
  browser?: BrowserOpener;
  clock?: OAuthClock;
  timers?: OAuthTimers;
  listener?: LoopbackListenerFactory;
  tokenClient?: GoogleTokenClient;
  fetch?: typeof fetch;
  tokenRequestTimeoutMs?: number;
  tokenTimers?: OAuthTimers;
};

type FailureState = {
  status: "failed" | "reconnect_required";
  code: ErrorCode;
};

type PendingSession = {
  credentials: DesktopCredentials;
  listener: LoopbackListener;
  state: string;
  verifier: string;
  timer: unknown;
  abortController: AbortController;
  result: PendingConnectGoogleResult;
  completion: Promise<SessionCompletion>;
  settle: (completion: SessionCompletion) => void;
  waiters: Set<object>;
  disposal?: Promise<void>;
  settled: boolean;
};

type SessionCompletion =
  | { type: "success"; result: ConnectedGoogleResult }
  | { type: "failure"; code: ErrorCode };

export class GoogleOAuthError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(messageForCode(code));
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

class GoogleTokenClientError extends Error {
  readonly code: "invalid_grant" | "GOOGLE_API_ERROR";

  constructor(code: "invalid_grant" | "GOOGLE_API_ERROR") {
    super(
      code === "invalid_grant"
        ? "Google authorization must be reconnected."
        : "Google authorization could not be completed. Try connecting again."
    );
    this.name = "GoogleTokenClientError";
    this.code = code;
  }
}

export function createSystemBrowserOpener(): BrowserOpener {
  return {
    open: async (authorizationUrl) => {
      await open(authorizationUrl);
    }
  };
}

export function createNodeLoopbackListenerFactory(): LoopbackListenerFactory {
  return {
    listen: async (request) => createNodeLoopbackListener(request)
  };
}

export function createGoogleTokenClient(options: GoogleTokenClientOptions = {}): GoogleTokenClient {
  const fetchImplementation = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const requestTimeoutMs = validRequestTimeoutMs(options.requestTimeoutMs);
  const timers = options.timers ?? systemOAuthTimers();

  return {
    exchangeAuthorizationCode: async (input) => {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.verifier,
        redirect_uri: input.redirectUri,
        client_id: input.clientId
      });

      if (input.clientSecret !== undefined) {
        form.set("client_secret", input.clientSecret);
      }

      return requestToken(
        fetchImplementation,
        now,
        input.tokenUri,
        form,
        input.signal,
        requestTimeoutMs,
        timers
      );
    },
    refreshAccessToken: async (input) => {
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: input.clientId
      });

      if (input.clientSecret !== undefined) {
        form.set("client_secret", input.clientSecret);
      }

      return requestToken(
        fetchImplementation,
        now,
        input.tokenUri,
        form,
        input.signal,
        requestTimeoutMs,
        timers
      );
    }
  };
}

export function createProductionGoogleOAuthDependencies(
  options: ProductionGoogleOAuthDependenciesOptions
): GoogleOAuthDependencies {
  const clock = options.clock ?? { now: () => Date.now() };

  return {
    credentialProvider: options.credentialProvider,
    tokenStore: options.tokenStore,
    browser: options.browser ?? createSystemBrowserOpener(),
    clock,
    timers: options.timers ?? systemOAuthTimers(),
    listener: options.listener ?? createNodeLoopbackListenerFactory(),
    tokenClient:
      options.tokenClient ??
      createGoogleTokenClient({
        fetch: options.fetch,
        now: () => clock.now(),
        requestTimeoutMs: options.tokenRequestTimeoutMs,
        timers: options.tokenTimers
      })
  };
}

export class GoogleOAuthCoordinator {
  private pending: PendingSession | undefined;
  private starting: Promise<PendingSession> | undefined;
  private readonly startingWaiters = new Set<object>();
  private readonly disposals = new Set<Promise<void>>();
  private lastFailure: FailureState | undefined;
  private closed = false;

  constructor(private readonly dependencies: GoogleOAuthDependencies) {}

  async close(): Promise<void> {
    this.closed = true;

    const session = this.pending;

    if (session) {
      await this.finishFailure(session, "AUTH_CANCELLED", "failed");
    }

    await this.waitForDisposals();
  }

  async start(
    confirm: true,
    options: StartGoogleOptions = {}
  ): Promise<ConnectGoogleResult> {
    if (this.closed) {
      throw new GoogleOAuthError("AUTH_CANCELLED");
    }
    if (confirm !== true) {
      throw new GoogleOAuthError("AUTH_REQUIRED");
    }
    if (options.waitForAuthorization && options.signal?.aborted) {
      throw new GoogleOAuthError("AUTH_CANCELLED");
    }

    if (!options.waitForAuthorization) {
      return (await this.getOrStartSession()).result;
    }

    const startingWaiter = {};
    this.startingWaiters.add(startingWaiter);
    const starting = this.getOrStartSession();
    let attachedToSession = false;

    try {
      const session = await waitForAbortable(starting, options.signal);

      this.startingWaiters.delete(startingWaiter);
      attachedToSession = true;

      return this.waitForSession(session, options.signal);
    } finally {
      if (!attachedToSession) {
        this.startingWaiters.delete(startingWaiter);
        this.cancelUnobservedStartingSession(starting);
      }
    }
  }

  private async getOrStartSession(): Promise<PendingSession> {
    if (this.pending) {
      return this.pending;
    }

    if (this.starting) {
      return this.starting;
    }

    const starting = this.startSession();
    this.starting = starting;

    try {
      return await starting;
    } finally {
      if (this.starting === starting) {
        this.starting = undefined;
      }
    }
  }

  async status(): Promise<AuthStatus> {
    if (this.pending) {
      return {
        credentialsConfigured: true,
        status: "waiting_for_authorization",
        projectId: this.pending.credentials.projectId,
        scopeGranted: false,
        authorizationExpiresAt: this.pending.result.authorizationExpiresAt
      };
    }

    let credentials: DesktopCredentials | null;

    try {
      credentials = await this.dependencies.credentialProvider.get();
    } catch (error) {
      const code = knownErrorCode(error) ?? "CREDENTIALS_NOT_CONFIGURED";

      this.recordFailure(code, "failed");

      return {
        credentialsConfigured: false,
        status: "failed",
        scopeGranted: false,
        lastErrorCode: code
      };
    }

    if (!credentials) {
      return {
        credentialsConfigured: false,
        status: "not_configured",
        scopeGranted: false
      };
    }

    let token: StoredGoogleToken | null;

    try {
      token = await this.dependencies.tokenStore.get(credentials.clientId);
    } catch (error) {
      const code = knownErrorCode(error) ?? "TOKEN_STORE_UNAVAILABLE";

      this.recordFailure(code, "failed");

      return this.failureStatus(credentials, { status: "failed", code });
    }

    if (!token) {
      return this.lastFailure
        ? this.failureStatus(credentials, this.lastFailure)
        : this.disconnectedStatus(credentials);
    }

    if (tokenNeedsRefresh(token, this.dependencies.clock.now())) {
      const refreshed = await this.refreshToken(credentials, token);

      if (!refreshed) {
        return this.failureStatus(
          credentials,
          this.lastFailure ?? { status: "failed", code: "GOOGLE_API_ERROR" }
        );
      }

      token = refreshed;
    }

    if (!token.accessToken) {
      const failure: FailureState = {
        code: "AUTH_RECONNECT_REQUIRED",
        status: "reconnect_required"
      };

      this.lastFailure = failure;

      return this.failureStatus(credentials, failure);
    }

    this.lastFailure = undefined;

    return {
      credentialsConfigured: true,
      status: "connected",
      projectId: credentials.projectId,
      scopeGranted: hasReadOnlyScope(token.scope),
      ...(token.expiryDate === undefined
        ? {}
        : { tokenExpiresAt: new Date(token.expiryDate).toISOString() })
    };
  }

  private async startSession(): Promise<PendingSession> {
    let credentials: DesktopCredentials | null;

    try {
      credentials = await this.dependencies.credentialProvider.get();
    } catch (error) {
      const code = knownErrorCode(error) ?? "CREDENTIALS_NOT_CONFIGURED";

      this.recordFailure(code, "failed");
      throw new GoogleOAuthError(code);
    }

    if (!credentials) {
      this.recordFailure("CREDENTIALS_NOT_CONFIGURED", "failed");
      throw new GoogleOAuthError("CREDENTIALS_NOT_CONFIGURED");
    }

    try {
      await this.dependencies.tokenStore.get(credentials.clientId);
    } catch (error) {
      const code = knownErrorCode(error) ?? "TOKEN_STORE_UNAVAILABLE";

      this.recordFailure(code, "failed");
      throw new GoogleOAuthError(code);
    }

    const pkce = createPkce();
    const state = createOAuthState();
    let listener: LoopbackListener | undefined;
    let session: PendingSession | undefined;

    try {
      listener = await this.dependencies.listener.listen({
        host: "127.0.0.1",
        port: 0,
        onCallback: async (callback) => {
          if (!session) {
            this.respond(callback, false);
            return;
          }

          await this.handleCallback(session, callback);
        }
      });

      if (this.closed) {
        await closeQuietly(listener);
        throw new GoogleOAuthError("AUTH_CANCELLED");
      }

      if (!isLoopbackRedirectUri(listener.redirectUri)) {
        throw new GoogleOAuthError("NETWORK_ERROR");
      }

      const authorizationExpiresAt = new Date(
        this.dependencies.clock.now() + AUTHORIZATION_TIMEOUT_MS
      ).toISOString();
      const result: PendingConnectGoogleResult = {
        authorizationStarted: true,
        status: "waiting_for_authorization",
        projectId: credentials.projectId,
        authorizationExpiresAt
      };
      const { completion, settle } = createSessionCompletion();
      const timer = this.dependencies.timers.setTimeout(() => {
        if (session) {
          void this.expireSession(session);
        }
      }, AUTHORIZATION_TIMEOUT_MS);

      session = {
        credentials,
        listener,
        state,
        verifier: pkce.verifier,
        timer,
        abortController: new AbortController(),
        result,
        completion,
        settle,
        waiters: new Set(),
        settled: false
      };
      this.pending = session;
      this.lastFailure = undefined;

      await this.dependencies.browser.open(
        authorizationUrl(credentials, listener.redirectUri, state, pkce.challenge)
      );

      return session;
    } catch (error) {
      const code = knownErrorCode(error) ?? "NETWORK_ERROR";

      if (session) {
        await this.finishFailure(session, code, "failed");
      } else {
        if (listener) {
          await closeQuietly(listener);
        }

        this.recordFailure(code, "failed");
      }

      throw new GoogleOAuthError(code);
    }
  }

  private async handleCallback(session: PendingSession, callback: LoopbackCallback): Promise<void> {
    if (!this.isActiveSession(session)) {
      this.respond(callback, false);
      return;
    }

    const callbackState = callback.query.get("state");
    const authorizationError = callback.query.get("error");
    const code = callback.query.get("code");

    if (!callbackState || callbackState !== session.state) {
      this.respond(callback, false);
      await this.finishFailure(session, "AUTH_REQUIRED", "failed");
      return;
    }

    if (authorizationError) {
      this.respond(callback, false);
      await this.finishFailure(session, "AUTH_CANCELLED", "failed");
      return;
    }

    if (!code) {
      this.respond(callback, false);
      await this.finishFailure(session, "AUTH_REQUIRED", "failed");
      return;
    }

    try {
      const exchangedToken = await this.dependencies.tokenClient.exchangeAuthorizationCode({
        code,
        verifier: session.verifier,
        redirectUri: session.listener.redirectUri,
        clientId: session.credentials.clientId,
        ...(session.credentials.clientSecret === undefined
          ? {}
          : { clientSecret: session.credentials.clientSecret }),
        tokenUri: session.credentials.tokenUri,
        signal: session.abortController.signal
      });

      if (!this.isActiveSession(session)) {
        return;
      }

      const token = mergeToken(exchangedToken, undefined);

      if (!this.isActiveSession(session)) {
        return;
      }

      await this.dependencies.tokenStore.set(session.credentials.clientId, token);

      if (!this.isActiveSession(session)) {
        return;
      }

      this.respond(callback, true);
      await this.finishSuccess(session, token);
    } catch (error) {
      if (!this.isActiveSession(session)) {
        return;
      }

      const code = exchangeErrorCode(error);
      const status = code === "AUTH_RECONNECT_REQUIRED" ? "reconnect_required" : "failed";

      this.respond(callback, false);
      await this.finishFailure(session, code, status);
    }
  }

  private async expireSession(session: PendingSession): Promise<void> {
    if (!this.isActiveSession(session)) {
      return;
    }

    await this.finishFailure(session, "AUTH_TIMEOUT", "failed");
  }

  private async finishSuccess(session: PendingSession, token: StoredGoogleToken): Promise<void> {
    if (session.settled) {
      return;
    }

    this.lastFailure = undefined;
    const result = connectedResult(session.credentials, token);
    this.settleSession(session, { type: "success", result });
    await this.disposeSession(session);
  }

  private async finishFailure(
    session: PendingSession,
    code: ErrorCode,
    status: FailureState["status"]
  ): Promise<void> {
    if (session.settled) {
      return;
    }

    this.recordFailure(code, status);
    this.settleSession(session, { type: "failure", code });
    await this.disposeSession(session);
  }

  private settleSession(session: PendingSession, completion: SessionCompletion): void {
    if (session.settled) {
      return;
    }

    session.settled = true;
    session.abortController.abort();
    this.dependencies.timers.clearTimeout(session.timer);

    if (this.pending === session) {
      this.pending = undefined;
    }

    session.settle(completion);
  }

  private async disposeSession(session: PendingSession): Promise<void> {
    if (!session.disposal) {
      const disposal = closeQuietly(session.listener);

      session.disposal = disposal;
      this.disposals.add(disposal);
      void disposal.then(
        () => this.disposals.delete(disposal),
        () => this.disposals.delete(disposal)
      );
    }

    await session.disposal;
  }

  private async waitForSession(
    session: PendingSession,
    signal: AbortSignal | undefined
  ): Promise<ConnectedGoogleResult> {
    const waiter = {};
    session.waiters.add(waiter);

    try {
      const completion = await waitForAbortable(session.completion, signal);

      if (completion.type === "failure") {
        throw new GoogleOAuthError(completion.code);
      }

      return completion.result;
    } finally {
      session.waiters.delete(waiter);

      if (signal?.aborted) {
        this.cancelUnobservedSession(session);
      }
    }
  }

  private cancelUnobservedSession(session: PendingSession): boolean {
    if (
      !this.isActiveSession(session) ||
      session.waiters.size > 0 ||
      this.startingWaiters.size > 0
    ) {
      return false;
    }

    const starting = this.starting;
    void this.finishFailure(session, "AUTH_CANCELLED", "failed");
    this.detachStartingSession(starting);
    return true;
  }

  private cancelUnobservedStartingSession(starting: Promise<PendingSession>): void {
    if (this.pending) {
      this.cancelUnobservedSession(this.pending);
      return;
    }

    void starting.then(
      (session) => this.cancelUnobservedSession(session),
      () => undefined
    );
  }

  private detachStartingSession(starting: Promise<PendingSession> | undefined): void {
    if (starting && this.starting === starting) {
      this.starting = undefined;
    }
  }

  private async waitForDisposals(): Promise<void> {
    while (this.disposals.size > 0) {
      await Promise.all(this.disposals);
    }
  }

  private async refreshToken(
    credentials: DesktopCredentials,
    storedToken: StoredGoogleToken
  ): Promise<StoredGoogleToken | undefined> {
    if (!storedToken.refreshToken) {
      await this.requireReconnect(credentials);
      return undefined;
    }

    try {
      const refreshedToken = await this.dependencies.tokenClient.refreshAccessToken({
        refreshToken: storedToken.refreshToken,
        clientId: credentials.clientId,
        ...(credentials.clientSecret === undefined ? {} : { clientSecret: credentials.clientSecret }),
        tokenUri: credentials.tokenUri,
        signal: new AbortController().signal
      });
      const token = mergeToken(refreshedToken, storedToken);

      await this.dependencies.tokenStore.set(credentials.clientId, token);
      this.lastFailure = undefined;

      return token;
    } catch (error) {
      if (isInvalidGrant(error)) {
        await this.requireReconnect(credentials);
        return undefined;
      }

      const code = knownErrorCode(error) ?? "GOOGLE_API_ERROR";

      this.recordFailure(code, "failed");
      return undefined;
    }
  }

  private async requireReconnect(credentials: DesktopCredentials): Promise<void> {
    try {
      await this.dependencies.tokenStore.delete(credentials.clientId);
      this.recordFailure("AUTH_RECONNECT_REQUIRED", "reconnect_required");
    } catch (error) {
      const code = knownErrorCode(error) ?? "TOKEN_STORE_UNAVAILABLE";

      this.recordFailure(code, "failed");
    }
  }

  private disconnectedStatus(credentials: DesktopCredentials): AuthStatus {
    return {
      credentialsConfigured: true,
      status: "disconnected",
      projectId: credentials.projectId,
      scopeGranted: false
    };
  }

  private failureStatus(credentials: DesktopCredentials, failure: FailureState): AuthStatus {
    return {
      credentialsConfigured: true,
      status: failure.status,
      projectId: credentials.projectId,
      scopeGranted: false,
      lastErrorCode: failure.code
    };
  }

  private recordFailure(code: ErrorCode, status: FailureState["status"]): void {
    this.lastFailure = { code, status };
  }

  private isActiveSession(session: PendingSession): boolean {
    return !session.settled && this.pending === session;
  }

  private respond(callback: LoopbackCallback, success: boolean): void {
    try {
      callback.respond(success ? successCallbackHtml() : failureCallbackHtml());
    } catch {
      // Callback response failures cannot leave the listener or timeout active.
    }
  }
}

function createSessionCompletion(): {
  completion: Promise<SessionCompletion>;
  settle: (completion: SessionCompletion) => void;
} {
  let settle: (completion: SessionCompletion) => void = () => undefined;
  const completion = new Promise<SessionCompletion>((resolve) => {
    settle = resolve;
  });

  return { completion, settle };
}

function waitForAbortable<Value>(
  operation: Promise<Value>,
  signal: AbortSignal | undefined
): Promise<Value> {
  if (!signal) {
    return operation;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      finish(() => reject(new GoogleOAuthError("AUTH_CANCELLED")));
    };

    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (result) => {
        finish(() => resolve(result));
      },
      (error: unknown) => {
        finish(() => reject(error));
      }
    );

    if (signal.aborted) {
      abort();
    }
  });
}

function connectedResult(
  credentials: DesktopCredentials,
  token: StoredGoogleToken
): ConnectedGoogleResult {
  return {
    authorizationStarted: true,
    status: "connected",
    projectId: credentials.projectId,
    scopeGranted: hasReadOnlyScope(token.scope),
    ...(token.expiryDate === undefined
      ? {}
      : { tokenExpiresAt: new Date(token.expiryDate).toISOString() })
  };
}

async function createNodeLoopbackListener(
  request: LoopbackListenerRequest
): Promise<LoopbackListener> {
  if (request.host !== "127.0.0.1" || request.port !== 0) {
    throw new GoogleOAuthError("NETWORK_ERROR");
  }

  let callbackHandled = false;
  const server = createServer((incoming, response) => {
    void handleLoopbackRequest(incoming, response, request.onCallback, () => {
      if (callbackHandled) {
        return false;
      }

      callbackHandled = true;
      return true;
    });
  });

  server.on("error", () => {
    // Startup and close paths map errors to stable coordinator errors.
  });

  try {
    const port = await listenOnLoopback(server);
    let closing: Promise<void> | undefined;

    return {
      redirectUri: `http://127.0.0.1:${port}/oauth/callback`,
      close: () => {
        closing ??= closeNodeServer(server);
        return closing;
      }
    };
  } catch {
    await closeNodeServer(server);
    throw new GoogleOAuthError("NETWORK_ERROR");
  }
}

async function listenOnLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = () => {
      cleanup();
      reject(new GoogleOAuthError("NETWORK_ERROR"));
    };
    const onListening = () => {
      cleanup();
      const address = server.address();

      if (!address || typeof address === "string" || address.port <= 0) {
        reject(new GoogleOAuthError("NETWORK_ERROR"));
        return;
      }

      resolve(address.port);
    };

    server.once("error", onError);
    server.once("listening", onListening);

    try {
      server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
    } catch {
      cleanup();
      reject(new GoogleOAuthError("NETWORK_ERROR"));
    }
  });
}

async function handleLoopbackRequest(
  request: IncomingMessage,
  response: ServerResponse,
  onCallback: LoopbackListenerRequest["onCallback"],
  claimCallback: () => boolean
): Promise<void> {
  if (request.method !== "GET") {
    writeSafeHtml(response, 405, failureCallbackHtml());
    return;
  }

  if (!request.url || !request.url.startsWith("/")) {
    writeSafeHtml(response, 404, failureCallbackHtml());
    return;
  }

  let callbackUrl: URL;

  try {
    callbackUrl = new URL(request.url, "http://127.0.0.1");
  } catch {
    writeSafeHtml(response, 400, failureCallbackHtml());
    return;
  }

  if (callbackUrl.pathname !== "/oauth/callback") {
    writeSafeHtml(response, 404, failureCallbackHtml());
    return;
  }

  if (!claimCallback()) {
    writeSafeHtml(response, 409, failureCallbackHtml());
    return;
  }

  let responded = false;
  const callback: LoopbackCallback = {
    query: callbackUrl.searchParams,
    respond: (html) => {
      if (responded || response.writableEnded) {
        return;
      }

      responded = true;
      writeSafeHtml(response, 200, html);
    }
  };

  try {
    await onCallback(callback);
  } catch {
    // The page remains generic even when an injected handler fails.
  }

  if (!responded) {
    writeSafeHtml(response, 400, failureCallbackHtml());
  }
}

function writeSafeHtml(response: ServerResponse, statusCode: number, html: string): void {
  if (response.writableEnded) {
    return;
  }

  response.writeHead(statusCode, {
    "cache-control": "no-store",
    connection: "close",
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(html);
}

async function closeNodeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      server.close(() => resolve());
      setImmediate(() => {
        try {
          server.closeAllConnections();
        } catch {
          // A concurrent close already released every loopback connection.
        }
      });
    } catch {
      resolve();
    }
  });
}

async function requestToken(
  fetchImplementation: typeof fetch,
  now: () => number,
  tokenUri: string,
  form: URLSearchParams,
  signal: AbortSignal,
  requestTimeoutMs: number,
  timers: OAuthTimers
): Promise<StoredGoogleToken> {
  const timeoutController = new AbortController();
  const combinedSignal = combineAbortSignals([signal, timeoutController.signal]);
  const timeout = timers.setTimeout(() => timeoutController.abort(), requestTimeoutMs);

  try {
    let response: Response;

    try {
      response = await fetchImplementation(tokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        redirect: "error",
        signal: combinedSignal.signal
      });
    } catch {
      throw new GoogleTokenClientError("GOOGLE_API_ERROR");
    }

    let rawBody: string;

    try {
      rawBody = await readBoundedResponse(response);
    } catch {
      throw new GoogleTokenClientError("GOOGLE_API_ERROR");
    }

    const body = parseTokenResponse(rawBody);

    if (!response.ok) {
      if (isRecord(body) && body.error === "invalid_grant") {
        throw new GoogleTokenClientError("invalid_grant");
      }

      throw new GoogleTokenClientError("GOOGLE_API_ERROR");
    }

    return normalizeTokenResponse(body, now());
  } finally {
    timers.clearTimeout(timeout);
    combinedSignal.cleanup();
  }
}

function validRequestTimeoutMs(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 30_000;
}

function systemOAuthTimers(): OAuthTimers {
  return {
    setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
    clearTimeout: (timer) => {
      globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>);
    }
  };
}

function combineAbortSignals(signals: AbortSignal[]): {
  signal: AbortSignal;
  cleanup(): void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const activeSignals = signals.filter((signal) => signal !== undefined);

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort();
      break;
    }

    signal.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of activeSignals) {
        signal.removeEventListener("abort", abort);
      }
    }
  };
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");

  if (declaredLength !== null) {
    const bytes = Number(declaredLength);

    if (Number.isFinite(bytes) && bytes > MAX_TOKEN_RESPONSE_BYTES) {
      throw new GoogleTokenClientError("GOOGLE_API_ERROR");
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const next = await reader.read();

      if (next.done) {
        break;
      }

      length += next.value.byteLength;

      if (length > MAX_TOKEN_RESPONSE_BYTES) {
        await reader.cancel();
        throw new GoogleTokenClientError("GOOGLE_API_ERROR");
      }

      chunks.push(next.value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // A failed cancellation does not expose token response data.
    }

    throw new GoogleTokenClientError("GOOGLE_API_ERROR");
  }

  const buffer = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(buffer);
}

function parseTokenResponse(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new GoogleTokenClientError("GOOGLE_API_ERROR");
  }
}

function normalizeTokenResponse(value: unknown, now: number): StoredGoogleToken {
  if (!isRecord(value)) {
    throw new GoogleTokenClientError("GOOGLE_API_ERROR");
  }

  const accessToken = optionalString(value.access_token);
  const refreshToken = optionalString(value.refresh_token);

  if (!accessToken && !refreshToken) {
    throw new GoogleTokenClientError("GOOGLE_API_ERROR");
  }

  const expiresIn = value.expires_in;
  let expiryDate: number | undefined;

  if (expiresIn !== undefined) {
    if (
      typeof expiresIn !== "number" ||
      !Number.isInteger(expiresIn) ||
      expiresIn < 0 ||
      expiresIn > Math.floor((Number.MAX_SAFE_INTEGER - now) / 1_000)
    ) {
      throw new GoogleTokenClientError("GOOGLE_API_ERROR");
    }

    expiryDate = now + expiresIn * 1_000;
  }

  return {
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(optionalString(value.scope) === undefined ? {} : { scope: optionalString(value.scope) }),
    ...(optionalString(value.token_type) === undefined
      ? {}
      : { tokenType: optionalString(value.token_type) }),
    ...(expiryDate === undefined ? {} : { expiryDate })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function authorizationUrl(
  credentials: DesktopCredentials,
  redirectUri: string,
  state: string,
  challenge: string
): string {
  const url = new URL(credentials.authUri);

  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SHEETS_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return url.toString();
}

function isLoopbackRedirectUri(value: string): boolean {
  try {
    const redirectUri = new URL(value);

    return (
      redirectUri.protocol === "http:" &&
      redirectUri.hostname === "127.0.0.1" &&
      redirectUri.port.length > 0 &&
      redirectUri.username === "" &&
      redirectUri.password === "" &&
      redirectUri.pathname === "/oauth/callback" &&
      redirectUri.search === "" &&
      redirectUri.hash === ""
    );
  } catch {
    return false;
  }
}

function tokenNeedsRefresh(token: StoredGoogleToken, now: number): boolean {
  return (
    token.accessToken === undefined ||
    (token.expiryDate !== undefined && token.expiryDate <= now + 60_000)
  );
}

function mergeToken(token: StoredGoogleToken, previous: StoredGoogleToken | undefined): StoredGoogleToken {
  return {
    ...(token.accessToken === undefined && previous?.accessToken === undefined
      ? {}
      : { accessToken: token.accessToken ?? previous?.accessToken }),
    ...(token.refreshToken === undefined && previous?.refreshToken === undefined
      ? {}
      : { refreshToken: token.refreshToken ?? previous?.refreshToken }),
    scope: token.scope ?? previous?.scope ?? GOOGLE_SHEETS_READONLY_SCOPE,
    ...(token.tokenType === undefined && previous?.tokenType === undefined
      ? {}
      : { tokenType: token.tokenType ?? previous?.tokenType }),
    ...(token.expiryDate === undefined && previous?.expiryDate === undefined
      ? {}
      : { expiryDate: token.expiryDate ?? previous?.expiryDate })
  };
}

function hasReadOnlyScope(scope: string | undefined): boolean {
  return scope?.split(/\s+/u).includes(GOOGLE_SHEETS_READONLY_SCOPE) ?? false;
}

function isInvalidGrant(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "invalid_grant"
  );
}

function knownErrorCode(error: unknown): ErrorCode | undefined {
  if (error instanceof TokenStoreUnavailableError) {
    return error.code;
  }

  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === "string" && ERROR_CODES.has(code as ErrorCode)
    ? (code as ErrorCode)
    : undefined;
}

function exchangeErrorCode(error: unknown): ErrorCode {
  if (isInvalidGrant(error)) {
    return "AUTH_RECONNECT_REQUIRED";
  }

  return knownErrorCode(error) ?? "GOOGLE_API_ERROR";
}

async function closeQuietly(listener: LoopbackListener): Promise<void> {
  try {
    await listener.close();
  } catch {
    // The OAuth session has already stopped accepting callbacks.
  }
}

function successCallbackHtml(): string {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Google connected</title></head><body><p>Google authorization is complete. You can close this window and return to Claude.</p></body></html>";
}

function failureCallbackHtml(): string {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Google authorization failed</title></head><body><p>Google authorization could not be completed. Return to Claude and try again.</p></body></html>";
}

function messageForCode(code: ErrorCode): string {
  switch (code) {
    case "CREDENTIALS_NOT_CONFIGURED":
      return "Google OAuth credentials are not configured.";
    case "INVALID_CREDENTIAL_FILE":
      return "Google OAuth credentials are invalid.";
    case "AUTH_REQUIRED":
      return "Google authorization must be started again.";
    case "AUTH_RECONNECT_REQUIRED":
      return "Google authorization must be reconnected.";
    case "AUTH_CANCELLED":
      return "Google authorization was cancelled.";
    case "AUTH_TIMEOUT":
      return "Google authorization timed out.";
    case "TOKEN_STORE_UNAVAILABLE":
      return "The OS token store is unavailable.";
    case "NETWORK_ERROR":
      return "Google authorization could not start. Check the browser and try again.";
    case "GOOGLE_API_ERROR":
      return "Google authorization could not be completed. Try connecting again.";
    default:
      return "Google authorization failed. Try connecting again.";
  }
}
