import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KeyringTokenStore } from "../../src/auth/token-store-keyring.js";

const canaryIt = process.env.RUN_KEYRING_CANARY === "1" ? it : it.skip;

describe("OS keyring canary", () => {
  canaryIt("round-trips an isolated token and deletes it during cleanup", async () => {
    const clientId = `keyring-canary-${randomUUID()}`;
    const token = { accessToken: `canary-access-${randomUUID()}` };
    const store = new KeyringTokenStore();
    let deleted = false;

    try {
      await store.set(clientId, token);
      await expect(store.get(clientId)).resolves.toEqual(token);

      await store.delete(clientId);
      deleted = true;
      await expect(store.get(clientId)).resolves.toBeNull();
    } finally {
      if (!deleted) {
        await store.delete(clientId);
      }
    }
  });
});
