import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDesktopCredentials } from "../../src/auth/credential-file.js";

const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;
const OAUTH_FIXTURES = fileURLToPath(new URL("../fixtures/oauth/", import.meta.url));

function fixturePath(name: string): string {
  return join(OAUTH_FIXTURES, name);
}

async function expectCredentialError(path: string): Promise<Error> {
  let caught: unknown;

  try {
    await loadDesktopCredentials(path);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ code: "INVALID_CREDENTIAL_FILE" });

  return caught as Error;
}

async function writeTemporaryCredentialFile(rawContent: string): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "pir2-credential-file-"));
  const path = join(directory, "credentials.json");

  await writeFile(path, rawContent, "utf8");

  return {
    path,
    cleanup: () => rm(directory, { recursive: true, force: true })
  };
}

function expectSafeError(error: Error, path: string, rawContent: string, clientId: string, secret: string): void {
  expect(error.message).not.toContain(path);
  expect(error.message).not.toContain(rawContent);
  expect(error.message).not.toContain(clientId);
  expect(error.message).not.toContain(secret);
}

describe("loadDesktopCredentials", () => {
  it("loads and normalizes installed desktop credentials", async () => {
    await expect(loadDesktopCredentials(fixturePath("installed-valid.json"))).resolves.toEqual({
      clientId: "unit-test-desktop-client.apps.googleusercontent.com",
      clientSecret: "unit-test-client-secret",
      projectId: "unit-test-desktop-project",
      authUri: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUri: "https://oauth2.googleapis.com/token",
      redirectUris: ["http://localhost"]
    });
  });

  it("accepts installed desktop credentials without a client secret", async () => {
    await expect(loadDesktopCredentials(fixturePath("installed-without-secret.json"))).resolves.toEqual({
      clientId: "unit-test-desktop-client.apps.googleusercontent.com",
      projectId: "unit-test-desktop-project",
      authUri: "https://accounts.google.com/o/oauth2/auth",
      tokenUri: "https://oauth2.googleapis.com/token",
      redirectUris: ["http://127.0.0.1:43123/oauth/callback"]
    });
  });

  it("accepts an IPv6 loopback redirect URI", async () => {
    const rawContent = JSON.stringify({
      installed: {
        client_id: "unit-test-ipv6-client.apps.googleusercontent.com",
        project_id: "unit-test-ipv6-project",
        auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        redirect_uris: ["http://[::1]:43123/oauth/callback"]
      }
    });
    const file = await writeTemporaryCredentialFile(rawContent);

    try {
      await expect(loadDesktopCredentials(file.path)).resolves.toEqual({
        clientId: "unit-test-ipv6-client.apps.googleusercontent.com",
        projectId: "unit-test-ipv6-project",
        authUri: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUri: "https://oauth2.googleapis.com/token",
        redirectUris: ["http://[::1]:43123/oauth/callback"]
      });
    } finally {
      await file.cleanup();
    }
  });

  it.each([
    ["malformed JSON", "malformed.json", "unit-test-malformed-client", "unit-test-malformed-secret"],
    ["a web-client export", "web-credentials.json", "unit-test-web-client.apps.googleusercontent.com", "unit-test-web-secret"],
    [
      "a desktop export missing its project ID",
      "missing-project-id.json",
      "unit-test-missing-project-client.apps.googleusercontent.com",
      "unit-test-missing-project-secret"
    ],
    [
      "a desktop export with a blank project ID",
      "blank-project-id.json",
      "unit-test-blank-project-client.apps.googleusercontent.com",
      "unit-test-blank-project-secret"
    ],
    [
      "a desktop export missing its token endpoint",
      "missing-token-uri.json",
      "unit-test-missing-endpoint-client.apps.googleusercontent.com",
      "unit-test-missing-endpoint-secret"
    ],
    [
      "a desktop export with a non-loopback redirect",
      "non-loopback-redirect.json",
      "unit-test-non-loopback-client.apps.googleusercontent.com",
      "unit-test-non-loopback-secret"
    ]
  ])("rejects %s without disclosing credential data", async (_caseName, name, clientId, secret) => {
    const path = fixturePath(name);
    const rawContent = await readFile(path, "utf8");
    const error = await expectCredentialError(path);

    expectSafeError(error, path, rawContent, clientId, secret);
  });

  it.each([
    [
      "an unapproved authorization endpoint",
      "https://example.com/oauth/authorize",
      "https://oauth2.googleapis.com/token",
      ["http://localhost"]
    ],
    [
      "an unapproved token endpoint",
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://example.com/oauth/token",
      ["http://localhost"]
    ],
    [
      "redirect userinfo",
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://oauth2.googleapis.com/token",
      ["http://attacker@localhost/oauth/callback"]
    ],
    [
      "an extra top-level credential client",
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://oauth2.googleapis.com/token",
      ["http://localhost"]
    ]
  ])(
    "rejects %s without disclosing temporary credential data",
    async (_caseName, authUri, tokenUri, redirectUris) => {
      const clientId = "unit-test-invalid-client.apps.googleusercontent.com";
      const secret = "unit-test-invalid-secret";
      const rawContent = JSON.stringify({
        installed: {
          client_id: clientId,
          client_secret: secret,
          project_id: "unit-test-invalid-project",
          auth_uri: authUri,
          token_uri: tokenUri,
          redirect_uris: redirectUris
        },
        ...(_caseName === "an extra top-level credential client"
          ? { web: { client_id: "other-client" } }
          : {})
      });
      const file = await writeTemporaryCredentialFile(rawContent);

      try {
        const error = await expectCredentialError(file.path);

        expectSafeError(error, file.path, rawContent, clientId, secret);
      } finally {
        await file.cleanup();
      }
    }
  );

  it("rejects a directory without echoing its path", async () => {
    const error = await expectCredentialError(OAUTH_FIXTURES);

    expect(error.message).not.toContain(OAUTH_FIXTURES);
  });

  it("rejects a credential file over 64 KiB without disclosing its content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pir2-credential-file-"));
    const path = join(directory, "oversized.json");
    const clientId = "unit-test-oversized-client.apps.googleusercontent.com";
    const secret = "unit-test-oversized-secret";
    const rawContent = JSON.stringify({
      installed: {
        client_id: clientId,
        client_secret: secret,
        project_id: "unit-test-oversized-project",
        auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        redirect_uris: ["http://localhost"],
        padding: "x".repeat(MAX_CREDENTIAL_FILE_BYTES)
      }
    });

    await writeFile(path, rawContent, "utf8");
    expect(Buffer.byteLength(rawContent, "utf8")).toBeGreaterThan(MAX_CREDENTIAL_FILE_BYTES);

    try {
      const error = await expectCredentialError(path);

      expectSafeError(error, path, rawContent, clientId, secret);
    } finally {
      await rm(dirname(path), { recursive: true, force: true });
    }
  });
});
