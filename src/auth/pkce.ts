import { createHash, randomBytes } from "node:crypto";

const PKCE_VERIFIER_RANDOM_BYTES = 48;
const OAUTH_STATE_RANDOM_BYTES = 32;

export type Pkce = {
  verifier: string;
  challenge: string;
};

function randomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

export function createPkce(): Pkce {
  const verifier = randomBase64Url(PKCE_VERIFIER_RANDOM_BYTES);

  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url")
  };
}

export function createOAuthState(): string {
  return randomBase64Url(OAUTH_STATE_RANDOM_BYTES);
}
