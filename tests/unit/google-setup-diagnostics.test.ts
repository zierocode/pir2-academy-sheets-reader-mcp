import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { diagnoseGoogleSetup } from "../../src/diagnostics/google-setup.js";

const DESKTOP = {
  installed: {
    client_id: "secret-client-id",
    client_secret: "secret-client-secret",
    project_id: "private-project",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    redirect_uris: ["http://localhost"]
  }
};

describe("diagnoseGoogleSetup", () => {
  it("reports a ready setup without returning secrets, identifiers, or paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sheets-diagnose-"));
    const credentialPath = join(directory, "credentials.json");
    await writeFile(credentialPath, JSON.stringify(DESKTOP));

    const result = await diagnoseGoogleSetup(
      { GOOGLE_OAUTH_CREDENTIALS_FILE: credentialPath },
      {
        status: vi.fn().mockResolvedValue({
          credentialsConfigured: true,
          status: "connected",
          projectId: "private-project",
          scopeGranted: true
        })
      },
      { get: vi.fn().mockResolvedValue({ refreshToken: "secret-token" }) }
    );

    expect(result).toMatchObject({
      overall: "ready",
      primaryCode: "READY",
      checks: {
        extensionLoaded: true,
        credentialsSelected: true,
        credentialFileReadable: true,
        credentialJsonValid: true,
        credentialType: "desktop",
        requiredFieldsPresent: true,
        loopbackRedirectReady: true,
        tokenStoreReady: true,
        googleConnected: true,
        readOnlyScopeGranted: true
      }
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [credentialPath, "secret-client-id", "secret-client-secret", "private-project", "secret-token"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("identifies a web OAuth client and returns only the matching fix", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sheets-diagnose-"));
    const credentialPath = join(directory, "credentials.json");
    await writeFile(credentialPath, JSON.stringify({ web: DESKTOP.installed }));

    const result = await diagnoseGoogleSetup(
      { GOOGLE_OAUTH_CREDENTIALS_FILE: credentialPath },
      { status: vi.fn().mockResolvedValue({ credentialsConfigured: false, status: "not_configured", scopeGranted: false }) },
      { get: vi.fn() }
    );

    expect(result).toMatchObject({
      overall: "needs_action",
      primaryCode: "OAUTH_CLIENT_MUST_BE_DESKTOP",
      checks: { credentialType: "web" }
    });
    expect(result.fixSteps).toHaveLength(3);
    expect(result.fixSteps.join(" ")).toContain("Desktop app");
  });
});
