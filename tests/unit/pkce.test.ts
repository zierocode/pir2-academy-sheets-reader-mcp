import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOAuthState, createPkce } from "../../src/auth/pkce.js";

const UNRESERVED = /^[A-Za-z0-9\-._~]{43,128}$/;
const BASE64_URL = /^[A-Za-z0-9_-]+$/;

describe("createPkce", () => {
  it("creates an RFC 7636 verifier and matching S256 challenge", () => {
    const pkce = createPkce();

    expect(pkce.verifier).toMatch(UNRESERVED);
    expect(pkce.challenge).toBe(
      createHash("sha256").update(pkce.verifier).digest("base64url")
    );
    expect(pkce.challenge).toMatch(BASE64_URL);
    expect(pkce.challenge).toHaveLength(43);
  });
});

describe("createOAuthState", () => {
  it("creates independent base64url state values from secure random bytes", () => {
    const states = Array.from({ length: 8 }, () => createOAuthState());

    expect(new Set(states)).toHaveLength(states.length);

    for (const state of states) {
      expect(state).toMatch(BASE64_URL);
      expect(state).toHaveLength(43);
    }
  });
});
