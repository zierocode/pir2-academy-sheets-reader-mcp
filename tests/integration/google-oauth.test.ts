import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DesktopCredentials } from "../../src/auth/credential-file.js";
import { TokenStoreUnavailableError, type StoredGoogleToken, type TokenStore } from "../../src/auth/token-store.js";
import {
  GOOGLE_SHEETS_READONLY_SCOPE,
  GoogleOAuthCoordinator,
  createGoogleTokenClient,
  createNodeLoopbackListenerFactory,
  type AuthStatus,
  type ConnectGoogleResult,
  type GoogleOAuthDependencies,
  type LoopbackCallback
} from "../../src/auth/google-oauth.js";

const NOW = Date.UTC(2026, 7, 4, 8, 0, 0);
const AUTHORIZATION_TIMEOUT_MS = 180_000;
const CLIENT_ID = "unit-desktop-client.apps.googleusercontent.com";
const CLIENT_SECRET = "unit-desktop-client-secret";
const PROJECT_ID = "unit-desktop-project";
const AUTHORIZATION_CODE = "unit-authorization-code";
const ACCESS_TOKEN = "unit-access-token";
const REFRESH_TOKEN = "unit-refresh-token";

const credentials: DesktopCredentials = {
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  projectId: PROJECT_ID,
  authUri: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUri: "https://oauth2.googleapis.com/token",
  redirectUris: ["http://127.0.0.1"]
};

type OAuthHarnessOptions = {
  credentials?: DesktopCredentials | null;
  initialToken?: StoredGoogleToken | null;
  tokenStoreError?: Error;
  listenerError?: Error;
  browserError?: Error;
  browserOpen?: (authorizationUrl: string) => Promise<void>;
  exchangeError?: Error;
  exchange?: (input: unknown) => Promise<StoredGoogleToken>;
  refreshError?: Error;
  exchangeToken?: StoredGoogleToken;
  refreshToken?: StoredGoogleToken;
  redirectUri?: string;
};

type OAuthHarness = {
  coordinator: GoogleOAuthCoordinator;
  browserUrls: string[];
  exchangeInputs: unknown[];
  refreshInputs: unknown[];
  listenerOptions: () => { host: string; port: number } | undefined;
  listenerCloseCount: () => number;
  activeTimerCount: () => number;
  scheduledDelays: number[];
  storedToken: () => StoredGoogleToken | null;
  fireCallback(query: Record<string, string>): Promise<string>;
  fireTimeout(): Promise<void>;
};

function createOAuthHarness(options: OAuthHarnessOptions = {}): OAuthHarness {
  let currentToken = options.initialToken ?? null;
  let callback: ((event: LoopbackCallback) => Promise<void>) | undefined;
  let listenerOptions: { host: string; port: number } | undefined;
  let closeCount = 0;
  let nextTimerId = 0;
  const timers = new Map<number, () => void>();
  const scheduledDelays: number[] = [];
  const browserUrls: string[] = [];
  const exchangeInputs: unknown[] = [];
  const refreshInputs: unknown[] = [];

  const tokenStore: TokenStore = {
    get: async () => {
      if (options.tokenStoreError) {
        throw options.tokenStoreError;
      }

      return currentToken;
    },
    set: async (_clientId, token) => {
      if (options.tokenStoreError) {
        throw options.tokenStoreError;
      }

      currentToken = token;
    },
    delete: async () => {
      if (options.tokenStoreError) {
        throw options.tokenStoreError;
      }

      currentToken = null;
    }
  };

  const dependencies: GoogleOAuthDependencies = {
    credentialProvider: {
      get: async () => options.credentials ?? credentials
    },
    tokenStore,
    browser: {
      open: async (authorizationUrl) => {
        if (options.browserError) {
          throw options.browserError;
        }

        browserUrls.push(authorizationUrl);
        await options.browserOpen?.(authorizationUrl);
      }
    },
    clock: {
      now: () => NOW
    },
    timers: {
      setTimeout: (handler, delayMs) => {
        const timerId = ++nextTimerId;

        timers.set(timerId, handler);
        scheduledDelays.push(delayMs);

        return timerId;
      },
      clearTimeout: (timerId) => {
        timers.delete(timerId as number);
      }
    },
    listener: {
      listen: async (request) => {
        if (options.listenerError) {
          throw options.listenerError;
        }

        listenerOptions = { host: request.host, port: request.port };
        callback = request.onCallback;

        return {
          redirectUri: options.redirectUri ?? "http://127.0.0.1:49152/oauth/callback",
          close: async () => {
            closeCount += 1;
          }
        };
      }
    },
    tokenClient: {
      exchangeAuthorizationCode: async (input) => {
        exchangeInputs.push(input);

        if (options.exchange) {
          return options.exchange(input);
        }

        if (options.exchangeError) {
          throw options.exchangeError;
        }

        return (
          options.exchangeToken ?? {
            accessToken: ACCESS_TOKEN,
            refreshToken: REFRESH_TOKEN,
            scope: GOOGLE_SHEETS_READONLY_SCOPE,
            tokenType: "Bearer",
            expiryDate: NOW + 3_600_000
          }
        );
      },
      refreshAccessToken: async (input) => {
        refreshInputs.push(input);

        if (options.refreshError) {
          throw options.refreshError;
        }

        return (
          options.refreshToken ?? {
            accessToken: "unit-refreshed-access-token",
            scope: GOOGLE_SHEETS_READONLY_SCOPE,
            tokenType: "Bearer",
            expiryDate: NOW + 3_600_000
          }
        );
      }
    }
  };

  return {
    coordinator: new GoogleOAuthCoordinator(dependencies),
    browserUrls,
    exchangeInputs,
    refreshInputs,
    listenerOptions: () => listenerOptions,
    listenerCloseCount: () => closeCount,
    activeTimerCount: () => timers.size,
    scheduledDelays,
    storedToken: () => currentToken,
    async fireCallback(query) {
      if (!callback) {
        throw new Error("The test listener has not received a callback handler.");
      }

      let html = "";

      await callback({
        query: new URLSearchParams(query),
        respond: (responseHtml) => {
          html = responseHtml;
        }
      });

      return html;
    },
    async fireTimeout() {
      const timer = timers.values().next().value;

      if (!timer) {
        throw new Error("The test session did not schedule an authorization timeout.");
      }

      timer();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

function authorizationState(harness: OAuthHarness): string {
  expect(harness.browserUrls).toHaveLength(1);

  return new URL(harness.browserUrls[0]).searchParams.get("state") ?? "";
}

function expectNoSensitiveData(value: string, sensitiveValues: string[]): void {
  for (const sensitiveValue of sensitiveValues) {
    expect(value).not.toContain(sensitiveValue);
  }
}

async function expectSafeError(
  action: () => Promise<unknown>,
  code: string,
  sensitiveValues: string[]
): Promise<Error> {
  let caught: unknown;

  try {
    await action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ code });

  const error = caught as Error;

  expectNoSensitiveData(error.message, sensitiveValues);

  return error;
}

describe("GoogleOAuthCoordinator", () => {
  it("starts a background PKCE authorization session and persists its successful callback", async () => {
    const harness = createOAuthHarness();

    const beforeStart: AuthStatus = await harness.coordinator.status();
    expect(beforeStart).toEqual({
      credentialsConfigured: true,
      status: "disconnected",
      projectId: PROJECT_ID,
      scopeGranted: false
    });

    const started: ConnectGoogleResult = await harness.coordinator.start(true);

    expect(started).toEqual({
      authorizationStarted: true,
      status: "waiting_for_authorization",
      projectId: PROJECT_ID,
      authorizationExpiresAt: new Date(NOW + AUTHORIZATION_TIMEOUT_MS).toISOString()
    });
    expect(harness.listenerOptions()).toEqual({ host: "127.0.0.1", port: 0 });
    expect(harness.scheduledDelays).toEqual([AUTHORIZATION_TIMEOUT_MS]);
    expect(harness.activeTimerCount()).toBe(1);

    const authorizationUrl = new URL(harness.browserUrls[0]);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:49152/oauth/callback"
    );
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("scope")).toBe(GOOGLE_SHEETS_READONLY_SCOPE);
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("prompt")).toBe("consent");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const waiting: AuthStatus = await harness.coordinator.status();
    expect(waiting).toEqual({
      credentialsConfigured: true,
      status: "waiting_for_authorization",
      projectId: PROJECT_ID,
      scopeGranted: false,
      authorizationExpiresAt: new Date(NOW + AUTHORIZATION_TIMEOUT_MS).toISOString()
    });

    const state = authorizationState(harness);
    const callbackHtml = await harness.fireCallback({ code: AUTHORIZATION_CODE, state });
    const exchange = harness.exchangeInputs[0] as {
      code: string;
      verifier: string;
      redirectUri: string;
      clientId: string;
      clientSecret?: string;
      tokenUri: string;
    };

    expect(exchange).toMatchObject({
      code: AUTHORIZATION_CODE,
      verifier: expect.any(String),
      redirectUri: "http://127.0.0.1:49152/oauth/callback",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      tokenUri: "https://oauth2.googleapis.com/token"
    });
    expect(exchange.signal).toBeInstanceOf(AbortSignal);
    expect(exchange.signal.aborted).toBe(true);
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(exchange.verifier).digest("base64url")
    );
    expect(callbackHtml).toContain("return to Claude");
    expectNoSensitiveData(callbackHtml, [AUTHORIZATION_CODE, state, CLIENT_SECRET, ACCESS_TOKEN]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);

    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "connected",
      projectId: PROJECT_ID,
      scopeGranted: true,
      tokenExpiresAt: new Date(NOW + 3_600_000).toISOString()
    });
    expect(harness.storedToken()).toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      scope: GOOGLE_SHEETS_READONLY_SCOPE,
      tokenType: "Bearer",
      expiryDate: NOW + 3_600_000
    });
  });

  it("requires literal learner confirmation before allocating an authorization listener", async () => {
    const harness = createOAuthHarness();

    await expectSafeError(
      () => harness.coordinator.start(false as never),
      "AUTH_REQUIRED",
      [CLIENT_SECRET]
    );
    expect(harness.browserUrls).toEqual([]);
    expect(harness.listenerCloseCount()).toBe(0);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("records a learner denial without exchanging a code or retaining resources", async () => {
    const harness = createOAuthHarness();

    await harness.coordinator.start(true);
    const state = authorizationState(harness);
    const denialDescription = "<script>unit-denial-description</script>";
    const callbackHtml = await harness.fireCallback({
      error: "access_denied",
      error_description: denialDescription,
      state
    });

    expect(harness.exchangeInputs).toEqual([]);
    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "AUTH_CANCELLED"
    });
    expectNoSensitiveData(callbackHtml, [denialDescription, state, CLIENT_SECRET]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("rejects a mismatched callback state before token exchange", async () => {
    const harness = createOAuthHarness();

    await harness.coordinator.start(true);
    const callbackHtml = await harness.fireCallback({
      code: AUTHORIZATION_CODE,
      state: "unit-mismatched-state"
    });

    expect(harness.exchangeInputs).toEqual([]);
    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "AUTH_REQUIRED"
    });
    expectNoSensitiveData(callbackHtml, [AUTHORIZATION_CODE, "unit-mismatched-state", CLIENT_SECRET]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("validates callback state before treating a denial as learner cancellation", async () => {
    const harness = createOAuthHarness();

    await harness.coordinator.start(true);
    const callbackHtml = await harness.fireCallback({
      error: "access_denied",
      state: "unit-mismatched-denial-state"
    });

    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "AUTH_REQUIRED"
    });
    expectNoSensitiveData(callbackHtml, ["unit-mismatched-denial-state", CLIENT_SECRET]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("expires an unanswered authorization session after 180 seconds", async () => {
    const harness = createOAuthHarness();

    await harness.coordinator.start(true);
    expect(harness.scheduledDelays).toEqual([AUTHORIZATION_TIMEOUT_MS]);

    await harness.fireTimeout();

    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "AUTH_TIMEOUT"
    });
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("does not persist a late exchange result after the authorization timeout", async () => {
    let resolveExchange: ((token: StoredGoogleToken) => void) | undefined;
    let exchangeSignal: AbortSignal | undefined;
    const deferredExchange = new Promise<StoredGoogleToken>((resolve) => {
      resolveExchange = resolve;
    });
    const harness = createOAuthHarness({
      exchange: async (input) => {
        exchangeSignal = (input as { signal: AbortSignal }).signal;
        return deferredExchange;
      }
    });

    await harness.coordinator.start(true);
    const callback = harness.fireCallback({
      code: AUTHORIZATION_CODE,
      state: authorizationState(harness)
    });
    await Promise.resolve();

    expect(exchangeSignal).toBeInstanceOf(AbortSignal);
    await harness.fireTimeout();
    expect(exchangeSignal?.aborted).toBe(true);

    resolveExchange?.({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      scope: GOOGLE_SHEETS_READONLY_SCOPE,
      expiryDate: NOW + 3_600_000
    });
    await callback;

    expect(harness.storedToken()).toBeNull();
    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "AUTH_TIMEOUT"
    });
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("returns the existing pending result without opening a second OAuth session", async () => {
    const harness = createOAuthHarness();

    const first = await harness.coordinator.start(true);
    const duplicate = await harness.coordinator.start(true);

    expect(duplicate).toEqual(first);
    expect(harness.browserUrls).toHaveLength(1);
    expect(harness.scheduledDelays).toEqual([AUTHORIZATION_TIMEOUT_MS]);
    expect(harness.activeTimerCount()).toBe(1);

    await harness.fireTimeout();
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("fails safely before browser launch when the OS token vault is unavailable", async () => {
    const harness = createOAuthHarness({
      tokenStoreError: new TokenStoreUnavailableError()
    });

    await expectSafeError(
      () => harness.coordinator.start(true),
      "TOKEN_STORE_UNAVAILABLE",
      [CLIENT_ID, CLIENT_SECRET]
    );
    expect(harness.browserUrls).toEqual([]);
    expect(harness.listenerCloseCount()).toBe(0);
    expect(harness.activeTimerCount()).toBe(0);
    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "TOKEN_STORE_UNAVAILABLE"
    });
  });

  it("refreshes an access token expiring within 60 seconds and preserves its refresh token", async () => {
    const harness = createOAuthHarness({
      initialToken: {
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        scope: GOOGLE_SHEETS_READONLY_SCOPE,
        tokenType: "Bearer",
        expiryDate: NOW + 60_000
      }
    });

    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "connected",
      projectId: PROJECT_ID,
      scopeGranted: true,
      tokenExpiresAt: new Date(NOW + 3_600_000).toISOString()
    });
    expect(harness.refreshInputs).toHaveLength(1);
    expect(harness.storedToken()).toEqual({
      accessToken: "unit-refreshed-access-token",
      refreshToken: REFRESH_TOKEN,
      scope: GOOGLE_SHEETS_READONLY_SCOPE,
      tokenType: "Bearer",
      expiryDate: NOW + 3_600_000
    });
  });

  it("requires a fresh connection after an invalid_grant refresh failure without retrying", async () => {
    const invalidGrant = Object.assign(new Error(`invalid_grant ${REFRESH_TOKEN}`), {
      code: "invalid_grant"
    });
    const harness = createOAuthHarness({
      initialToken: {
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        scope: GOOGLE_SHEETS_READONLY_SCOPE,
        tokenType: "Bearer",
        expiryDate: NOW + 60_000
      },
      refreshError: invalidGrant
    });

    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "reconnect_required",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "AUTH_RECONNECT_REQUIRED"
    });
    expect(harness.refreshInputs).toHaveLength(1);
    expect(harness.storedToken()).toBeNull();
  });

  it("maps a listener startup failure to a safe failed status", async () => {
    const listenerFailure = new Error(`listener failed for ${CLIENT_SECRET}`);
    const harness = createOAuthHarness({ listenerError: listenerFailure });

    await expectSafeError(() => harness.coordinator.start(true), "NETWORK_ERROR", [CLIENT_SECRET]);
    expect(harness.browserUrls).toEqual([]);
    expect(harness.activeTimerCount()).toBe(0);
    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "NETWORK_ERROR"
    });
  });

  it.each([
    "http://unit-userinfo@127.0.0.1:49152/oauth/callback",
    "http://127.0.0.1:49152/not-oauth-callback"
  ])("rejects an unsafe loopback listener redirect URI", async (redirectUri) => {
    const harness = createOAuthHarness({ redirectUri });

    await expectSafeError(() => harness.coordinator.start(true), "NETWORK_ERROR", [CLIENT_SECRET]);
    expect(harness.browserUrls).toEqual([]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });

  it("closes the listener when the browser opener fails", async () => {
    const browserFailure = new Error(`browser failed for ${CLIENT_SECRET}`);
    const harness = createOAuthHarness({ browserError: browserFailure });

    await expectSafeError(() => harness.coordinator.start(true), "NETWORK_ERROR", [CLIENT_SECRET]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
    expect(await harness.coordinator.status()).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "NETWORK_ERROR"
    });
  });

  it("does not expose callback or credential data when token exchange fails", async () => {
    const exchangeFailure = new Error(
      `exchange failed for ${AUTHORIZATION_CODE} with ${CLIENT_SECRET}`
    );
    const harness = createOAuthHarness({ exchangeError: exchangeFailure });

    await harness.coordinator.start(true);
    const state = authorizationState(harness);
    const callbackHtml = await harness.fireCallback({ code: AUTHORIZATION_CODE, state });
    const status = await harness.coordinator.status();

    expect(status).toEqual({
      credentialsConfigured: true,
      status: "failed",
      projectId: PROJECT_ID,
      scopeGranted: false,
      lastErrorCode: "GOOGLE_API_ERROR"
    });
    expectNoSensitiveData(JSON.stringify(status), [AUTHORIZATION_CODE, state, CLIENT_SECRET]);
    expectNoSensitiveData(callbackHtml, [AUTHORIZATION_CODE, state, CLIENT_SECRET]);
    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });
});

describe("production OAuth dependencies", () => {
  it("serves one safe callback from an ephemeral 127.0.0.1 listener", async () => {
    const received: string[] = [];
    const listener = await createNodeLoopbackListenerFactory().listen({
      host: "127.0.0.1",
      port: 0,
      onCallback: async (callback) => {
        received.push(callback.query.get("state") ?? "");
        callback.respond("<!doctype html><p>return to Claude</p>");
      }
    });
    const sensitiveState = "unit-loopback-sensitive-state";

    try {
      const callbackResponse = await fetch(
        `${listener.redirectUri}?code=${AUTHORIZATION_CODE}&state=${sensitiveState}`
      );
      const callbackHtml = await callbackResponse.text();

      expect(callbackResponse.status).toBe(200);
      expect(callbackHtml).toContain("return to Claude");
      expectNoSensitiveData(callbackHtml, [AUTHORIZATION_CODE, sensitiveState]);
      expect(received).toEqual([sensitiveState]);

      const wrongPathResponse = await fetch(
        listener.redirectUri.replace("/oauth/callback", "/not-oauth-callback?state=wrong-path")
      );
      const wrongPathHtml = await wrongPathResponse.text();

      expect(wrongPathResponse.status).toBe(404);
      expectNoSensitiveData(wrongPathHtml, ["wrong-path", CLIENT_SECRET]);

      const duplicateResponse = await fetch(`${listener.redirectUri}?state=second-callback`);
      const duplicateHtml = await duplicateResponse.text();

      expect(duplicateResponse.status).toBe(409);
      expectNoSensitiveData(duplicateHtml, ["second-callback", CLIENT_SECRET]);

      const methodResponse = await fetch(listener.redirectUri, { method: "POST" });
      expect(methodResponse.status).toBe(405);
    } finally {
      await listener.close();
    }
  });

  it("exchanges and refreshes tokens through bounded form-encoded fetch requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const tokenClient = createGoogleTokenClient({
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });

        return new Response(
          JSON.stringify({
            access_token: "unit-production-access-token",
            refresh_token: "unit-production-refresh-token",
            scope: GOOGLE_SHEETS_READONLY_SCOPE,
            token_type: "Bearer",
            expires_in: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
      now: () => NOW
    });

    const exchanged = await tokenClient.exchangeAuthorizationCode({
      code: AUTHORIZATION_CODE,
      verifier: "unit-pkce-verifier",
      redirectUri: "http://127.0.0.1:49152/oauth/callback",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      tokenUri: "https://oauth2.googleapis.com/token",
      signal: new AbortController().signal
    });
    const refreshed = await tokenClient.refreshAccessToken({
      refreshToken: REFRESH_TOKEN,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      tokenUri: "https://oauth2.googleapis.com/token",
      signal: new AbortController().signal
    });

    expect(exchanged).toEqual({
      accessToken: "unit-production-access-token",
      refreshToken: "unit-production-refresh-token",
      scope: GOOGLE_SHEETS_READONLY_SCOPE,
      tokenType: "Bearer",
      expiryDate: NOW + 3_600_000
    });
    expect(refreshed).toEqual(exchanged);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(String(requests[0]?.init?.body)).toContain("grant_type=authorization_code");
    expect(String(requests[0]?.init?.body)).toContain("code_verifier=unit-pkce-verifier");
    expect(String(requests[1]?.init?.body)).toContain("grant_type=refresh_token");
  });

  it("maps invalid_grant and oversized token responses without exposing their body", async () => {
    const sensitiveDescription = `invalid grant for ${REFRESH_TOKEN} and ${CLIENT_SECRET}`;
    const invalidGrantClient = createGoogleTokenClient({
      fetch: async () =>
        new Response(JSON.stringify({ error: "invalid_grant", error_description: sensitiveDescription }), {
          status: 400,
          headers: { "content-type": "application/json" }
        })
    });

    const invalidGrant = await expectSafeError(
      () =>
        invalidGrantClient.refreshAccessToken({
          refreshToken: REFRESH_TOKEN,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          tokenUri: "https://oauth2.googleapis.com/token",
          signal: new AbortController().signal
        }),
      "invalid_grant",
      [sensitiveDescription, REFRESH_TOKEN, CLIENT_SECRET]
    );
    expect(invalidGrant.message).not.toContain("invalid_grant");

    const oversizedBody = JSON.stringify({ access_token: "x".repeat(65 * 1024) });
    const oversizedClient = createGoogleTokenClient({
      fetch: async () =>
        new Response(oversizedBody, {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    });

    await expectSafeError(
      () =>
        oversizedClient.refreshAccessToken({
          refreshToken: REFRESH_TOKEN,
          clientId: CLIENT_ID,
          tokenUri: "https://oauth2.googleapis.com/token",
          signal: new AbortController().signal
        }),
      "GOOGLE_API_ERROR",
      [REFRESH_TOKEN, oversizedBody]
    );
  });

  it("aborts a hung token request at its bounded timeout and clears its timer", async () => {
    const timer = {};
    const activeTimers = new Set<unknown>();
    let timeoutHandler: (() => void) | undefined;
    let fetchSignal: AbortSignal | undefined;
    const tokenClient = createGoogleTokenClient({
      requestTimeoutMs: 30_000,
      timers: {
        setTimeout: (handler) => {
          timeoutHandler = handler;
          activeTimers.add(timer);
          return timer;
        },
        clearTimeout: (timerHandle) => {
          activeTimers.delete(timerHandle);
        }
      },
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          fetchSignal = init?.signal as AbortSignal;
          fetchSignal.addEventListener("abort", () => reject(new Error("unit fetch aborted")), {
            once: true
          });
        })
    });

    const request = tokenClient.refreshAccessToken({
      refreshToken: REFRESH_TOKEN,
      clientId: CLIENT_ID,
      tokenUri: "https://oauth2.googleapis.com/token",
      signal: new AbortController().signal
    });
    await Promise.resolve();

    expect(fetchSignal).toBeInstanceOf(AbortSignal);
    expect(activeTimers.size).toBe(1);
    timeoutHandler?.();

    await expectSafeError(() => request, "GOOGLE_API_ERROR", [REFRESH_TOKEN, CLIENT_SECRET]);
    expect(fetchSignal?.aborted).toBe(true);
    expect(activeTimers.size).toBe(0);
  });

  it("propagates a coordinator-provided abort signal to a hung token request", async () => {
    const caller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const tokenClient = createGoogleTokenClient({
      requestTimeoutMs: 30_000,
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          fetchSignal = init?.signal as AbortSignal;
          fetchSignal.addEventListener("abort", () => reject(new Error("unit caller aborted")), {
            once: true
          });
        })
    });

    const request = tokenClient.refreshAccessToken({
      refreshToken: REFRESH_TOKEN,
      clientId: CLIENT_ID,
      tokenUri: "https://oauth2.googleapis.com/token",
      signal: caller.signal
    });
    await Promise.resolve();

    caller.abort();
    await expectSafeError(() => request, "GOOGLE_API_ERROR", [REFRESH_TOKEN, CLIENT_SECRET]);
    expect(fetchSignal?.aborted).toBe(true);
  });

  it("closes a pending authorization listener and clears its timer", async () => {
    const harness = createOAuthHarness();

    await harness.coordinator.start(true);
    expect(harness.listenerCloseCount()).toBe(0);
    expect(harness.activeTimerCount()).toBe(1);

    await harness.coordinator.close();

    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
    await harness.coordinator.close();
    expect(harness.listenerCloseCount()).toBe(1);
  });

  it("closes immediately while a browser opener is stalled", async () => {
    const harness = createOAuthHarness({
      browserOpen: async () => new Promise<void>(() => undefined)
    });
    void harness.coordinator.start(true);
    await vi.waitFor(() => expect(harness.activeTimerCount()).toBe(1));

    await expect(harness.coordinator.close()).resolves.toBeUndefined();

    expect(harness.listenerCloseCount()).toBe(1);
    expect(harness.activeTimerCount()).toBe(0);
  });
});
