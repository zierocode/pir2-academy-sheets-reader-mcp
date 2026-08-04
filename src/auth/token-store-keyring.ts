import { createHash } from "node:crypto";
import { Entry } from "@napi-rs/keyring";
import {
  normalizeStoredGoogleToken,
  requireClientId,
  TokenStoreUnavailableError,
  unavailableTokenStore,
  type StoredGoogleToken,
  type TokenStore
} from "./token-store.js";

const SERVICE = "pir2-academy-sheets-reader-mcp";

export type KeyringEntry = {
  getPassword(): string | null | undefined;
  setPassword(password: string): void;
  deletePassword(): unknown;
};

export type KeyringBinding = {
  Entry: new (service: string, account: string) => KeyringEntry;
};

function accountForClientId(clientId: string): string {
  return createHash("sha256").update(clientId).digest("hex").slice(0, 32);
}

export class KeyringTokenStore implements TokenStore {
  constructor(private readonly keyring: KeyringBinding = { Entry }) {}

  async get(clientId: string): Promise<StoredGoogleToken | null> {
    return this.withUnavailableError(() => {
      const password = this.entryFor(clientId).getPassword();

      if (password === null || password === undefined) {
        return null;
      }

      if (typeof password !== "string") {
        return unavailableTokenStore();
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(password);
      } catch {
        return unavailableTokenStore();
      }

      const token = normalizeStoredGoogleToken(parsed);

      return token ?? unavailableTokenStore();
    });
  }

  async set(clientId: string, token: StoredGoogleToken): Promise<void> {
    return this.withUnavailableError(() => {
      const normalizedToken = normalizeStoredGoogleToken(token);

      if (!normalizedToken) {
        return unavailableTokenStore();
      }

      this.entryFor(clientId).setPassword(JSON.stringify(normalizedToken));
    });
  }

  async delete(clientId: string): Promise<void> {
    return this.withUnavailableError(() => {
      this.entryFor(clientId).deletePassword();
    });
  }

  private entryFor(clientId: string): KeyringEntry {
    const validClientId = requireClientId(clientId);

    return new this.keyring.Entry(SERVICE, accountForClientId(validClientId));
  }

  private withUnavailableError<Value>(operation: () => Value): Value {
    try {
      return operation();
    } catch (error) {
      if (error instanceof TokenStoreUnavailableError) {
        throw error;
      }

      return unavailableTokenStore();
    }
  }
}
