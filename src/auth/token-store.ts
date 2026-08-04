import { z } from "zod";
import type { ErrorCode } from "../errors.js";

export type StoredGoogleToken = {
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiryDate?: number;
};

export interface TokenStore {
  get(clientId: string): Promise<StoredGoogleToken | null>;
  set(clientId: string, token: StoredGoogleToken): Promise<void>;
  delete(clientId: string): Promise<void>;
}

type TokenStoreErrorCode = Extract<ErrorCode, "TOKEN_STORE_UNAVAILABLE">;

export class TokenStoreUnavailableError extends Error {
  readonly code: TokenStoreErrorCode = "TOKEN_STORE_UNAVAILABLE";

  constructor() {
    super("The OS token store is unavailable.");
    this.name = "TokenStoreUnavailableError";
  }
}

const storedGoogleTokenSchema = z
  .object({
    accessToken: z.string().trim().min(1).optional(),
    refreshToken: z.string().trim().min(1).optional(),
    scope: z.string().trim().min(1).optional(),
    tokenType: z.string().trim().min(1).optional(),
    expiryDate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
  })
  .strict()
  .refine((token) => token.accessToken !== undefined || token.refreshToken !== undefined);

export function unavailableTokenStore(): never {
  throw new TokenStoreUnavailableError();
}

export function normalizeStoredGoogleToken(value: unknown): StoredGoogleToken | undefined {
  const parsed = storedGoogleTokenSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

export function requireClientId(clientId: string): string {
  if (typeof clientId !== "string" || clientId.trim().length === 0) {
    return unavailableTokenStore();
  }

  return clientId;
}
