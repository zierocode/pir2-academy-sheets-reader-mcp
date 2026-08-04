import { describe, expect, it } from "vitest";
import type { StoredGoogleToken } from "../../src/auth/token-store.js";
import {
  type KeyringBinding,
  KeyringTokenStore
} from "../../src/auth/token-store-keyring.js";

const SERVICE = "pir2-academy-sheets-reader-mcp";
const CLIENT_ID = "client-one";
const ACCOUNT = "65a478e16c77cd625ad979fcbf12bb6b";

type KeyringFailure = "construct" | "get" | "set" | "delete";

type MemoryKeyring = {
  binding: KeyringBinding;
  entries: Map<string, string>;
  created: Array<{ service: string; account: string }>;
};

function entryKey(service: string, account: string): string {
  return `${service}/${account}`;
}

function createMemoryKeyring(failure?: KeyringFailure): MemoryKeyring {
  const entries = new Map<string, string>();
  const created: Array<{ service: string; account: string }> = [];

  class MemoryEntry {
    readonly key: string;

    constructor(service: string, account: string) {
      created.push({ service, account });

      if (failure === "construct") {
        throw new Error("unit keyring constructor failure");
      }

      this.key = entryKey(service, account);
    }

    getPassword(): string | null {
      if (failure === "get") {
        throw new Error("unit keyring get failure");
      }

      return entries.get(this.key) ?? null;
    }

    setPassword(value: string): void {
      if (failure === "set") {
        throw new Error("unit keyring set failure");
      }

      entries.set(this.key, value);
    }

    deletePassword(): void {
      if (failure === "delete") {
        throw new Error("unit keyring delete failure");
      }

      entries.delete(this.key);
    }
  }

  return {
    binding: { Entry: MemoryEntry },
    entries,
    created
  };
}

async function expectUnavailable(
  action: () => Promise<unknown>,
  sensitiveValues: string[]
): Promise<Error> {
  let caught: unknown;

  try {
    await action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ code: "TOKEN_STORE_UNAVAILABLE" });

  const unavailable = caught as Error;

  for (const value of sensitiveValues) {
    expect(unavailable.message).not.toContain(value);
  }

  return unavailable;
}

describe("KeyringTokenStore", () => {
  it("stores normalized tokens in the OS-vault entry derived from the client ID", async () => {
    const keyring = createMemoryKeyring();
    const store = new KeyringTokenStore(keyring.binding);
    const token: StoredGoogleToken = {
      accessToken: "unit-access-token",
      refreshToken: "unit-refresh-token",
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      tokenType: "Bearer",
      expiryDate: 1_762_000_000_000
    };

    await store.set(CLIENT_ID, token);

    expect(keyring.created).toEqual([{ service: SERVICE, account: ACCOUNT }]);
    expect(keyring.entries.get(entryKey(SERVICE, ACCOUNT))).toBe(JSON.stringify(token));
    await expect(store.get(CLIENT_ID)).resolves.toEqual(token);

    await store.delete(CLIENT_ID);

    await expect(store.get(CLIENT_ID)).resolves.toBeNull();
  });

  it("accepts a refresh-only token", async () => {
    const keyring = createMemoryKeyring();
    const store = new KeyringTokenStore(keyring.binding);
    const token: StoredGoogleToken = { refreshToken: "unit-refresh-token" };

    await store.set(CLIENT_ID, token);

    await expect(store.get(CLIENT_ID)).resolves.toEqual(token);
  });

  it("maps a missing vault entry to null", async () => {
    const store = new KeyringTokenStore(createMemoryKeyring().binding);

    await expect(store.get(CLIENT_ID)).resolves.toBeNull();
  });

  it("maps an undefined password from the vault binding to null", async () => {
    class UndefinedPasswordEntry {
      constructor(_service: string, _account: string) {}

      getPassword(): undefined {
        return undefined;
      }

      setPassword(_value: string): void {}

      deletePassword(): void {}
    }

    const store = new KeyringTokenStore({ Entry: UndefinedPasswordEntry });

    await expect(store.get(CLIENT_ID)).resolves.toBeNull();
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["a token without access or refresh credentials", JSON.stringify({ scope: "scope" })],
    ["an invalid expiry date", JSON.stringify({ accessToken: "unit-access-token", expiryDate: -1 })]
  ])("maps %s in the vault to a safe unavailable error", async (_caseName, rawValue) => {
    const keyring = createMemoryKeyring();
    const store = new KeyringTokenStore(keyring.binding);

    keyring.entries.set(entryKey(SERVICE, ACCOUNT), rawValue);

    await expectUnavailable(() => store.get(CLIENT_ID), [CLIENT_ID, rawValue, "unit-access-token"]);
  });

  it.each([
    ["an empty token", {}],
    ["an empty access token", { accessToken: "" }],
    ["an invalid expiry date", { accessToken: "unit-access-token", expiryDate: -1 }]
  ])("rejects %s before writing it to the vault", async (_caseName, token) => {
    const keyring = createMemoryKeyring();
    const store = new KeyringTokenStore(keyring.binding);

    await expectUnavailable(() => store.set(CLIENT_ID, token), [CLIENT_ID, "unit-access-token"]);
    expect(keyring.entries).toHaveLength(0);
  });

  it.each([
    ["construct", (store: KeyringTokenStore) => store.get(CLIENT_ID)],
    ["get", (store: KeyringTokenStore) => store.get(CLIENT_ID)],
    ["set", (store: KeyringTokenStore) => store.set(CLIENT_ID, { accessToken: "unit-access-token" })],
    ["delete", (store: KeyringTokenStore) => store.delete(CLIENT_ID)]
  ])("maps a %s binding failure to a safe unavailable error", async (operation, action) => {
    const keyring = createMemoryKeyring(operation as KeyringFailure);
    const store = new KeyringTokenStore(keyring.binding);

    await expectUnavailable(() => action(store), [CLIENT_ID, "unit-access-token"]);
  });

  it.each([
    ["get", (store: KeyringTokenStore) => store.get("")],
    ["set", (store: KeyringTokenStore) => store.set("", { accessToken: "unit-access-token" })],
    ["delete", (store: KeyringTokenStore) => store.delete("")]
  ])("maps an empty client ID during %s to a safe unavailable error", async (_operation, action) => {
    await expectUnavailable(() => action(new KeyringTokenStore(createMemoryKeyring().binding)), [
      "unit-access-token"
    ]);
  });
});
