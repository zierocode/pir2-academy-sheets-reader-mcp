import { open } from "node:fs/promises";
import { z } from "zod";
import type { ErrorCode } from "../errors.js";

const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;
const AUTHORIZATION_ENDPOINTS = [
  "https://accounts.google.com/o/oauth2/auth",
  "https://accounts.google.com/o/oauth2/v2/auth"
] as const;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type DesktopCredentials = {
  clientId: string;
  clientSecret?: string;
  authUri: string;
  tokenUri: string;
  redirectUris: string[];
};

type CredentialFileErrorCode = Extract<ErrorCode, "INVALID_CREDENTIAL_FILE">;

export class CredentialFileError extends Error {
  readonly code: CredentialFileErrorCode = "INVALID_CREDENTIAL_FILE";

  constructor() {
    super("The OAuth credential file is invalid.");
    this.name = "CredentialFileError";
  }
}

function invalidCredentialFile(): never {
  throw new CredentialFileError();
}

function isLoopbackRedirectUri(value: string): boolean {
  let redirectUri: URL;

  try {
    redirectUri = new URL(value);
  } catch {
    return false;
  }

  return (
    redirectUri.protocol === "http:" &&
    redirectUri.username === "" &&
    redirectUri.password === "" &&
    LOOPBACK_HOSTS.has(redirectUri.hostname)
  );
}

const installedCredentialsSchema = z
  .object({
    client_id: z.string().trim().min(1),
    client_secret: z.string().trim().min(1).optional(),
    auth_uri: z.enum(AUTHORIZATION_ENDPOINTS),
    token_uri: z.literal(TOKEN_ENDPOINT),
    redirect_uris: z
      .array(z.string().trim().min(1).refine(isLoopbackRedirectUri))
      .min(1)
  })
  .passthrough();

const credentialFileSchema = z
  .object({
    installed: installedCredentialsSchema
  })
  .strict();

async function readCredentialFile(path: string): Promise<string> {
  let fileHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    fileHandle = await open(path, "r");
    const initialStats = await fileHandle.stat();

    if (!initialStats.isFile() || initialStats.size > MAX_CREDENTIAL_FILE_BYTES) {
      return invalidCredentialFile();
    }

    const buffer = Buffer.allocUnsafe(MAX_CREDENTIAL_FILE_BYTES);
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
    const finalStats = await fileHandle.stat();

    if (bytesRead > MAX_CREDENTIAL_FILE_BYTES || finalStats.size > MAX_CREDENTIAL_FILE_BYTES) {
      return invalidCredentialFile();
    }

    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (error instanceof CredentialFileError) {
      throw error;
    }

    return invalidCredentialFile();
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch {
        // File-close failures do not expose filesystem details to callers.
      }
    }
  }
}

export async function loadDesktopCredentials(path: string): Promise<DesktopCredentials> {
  const rawContent = await readCredentialFile(path);
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawContent);
  } catch {
    return invalidCredentialFile();
  }

  const parsedCredentials = credentialFileSchema.safeParse(parsedJson);

  if (!parsedCredentials.success) {
    return invalidCredentialFile();
  }

  const installed = parsedCredentials.data.installed;

  return {
    clientId: installed.client_id,
    ...(installed.client_secret === undefined ? {} : { clientSecret: installed.client_secret }),
    authUri: installed.auth_uri,
    tokenUri: installed.token_uri,
    redirectUris: [...installed.redirect_uris]
  };
}
