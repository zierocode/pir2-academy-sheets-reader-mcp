import { inspectDesktopCredentialFile, loadDesktopCredentials } from "../auth/credential-file.js";
import type { AuthStatus } from "../auth/google-oauth.js";
import type { TokenStore } from "../auth/token-store.js";

export type GoogleSetupDiagnosisCode =
  | "READY"
  | "CREDENTIAL_FILE_NOT_SELECTED"
  | "CREDENTIAL_FILE_UNREADABLE"
  | "CREDENTIAL_JSON_INVALID"
  | "OAUTH_CLIENT_MUST_BE_DESKTOP"
  | "OAUTH_FIELDS_INVALID"
  | "LOOPBACK_REDIRECT_MISSING"
  | "TOKEN_STORE_UNAVAILABLE"
  | "GOOGLE_NOT_CONNECTED"
  | "GOOGLE_RECONNECT_REQUIRED";

export type GoogleSetupDiagnosis = {
  overall: "ready" | "needs_action" | "blocked";
  primaryCode: GoogleSetupDiagnosisCode;
  checks: {
    extensionLoaded: true;
    platform: NodeJS.Platform;
    architecture: string;
    credentialsSelected: boolean;
    credentialFileReadable: boolean;
    credentialJsonValid: boolean;
    credentialType: "desktop" | "web" | "unknown";
    requiredFieldsPresent: boolean;
    loopbackRedirectReady: boolean;
    tokenStoreReady: boolean;
    tokenPresent: boolean;
    googleConnected: boolean;
    readOnlyScopeGranted: boolean;
  };
  fixSteps: string[];
};

type StatusProvider = { status(): Promise<AuthStatus> };

function result(
  code: GoogleSetupDiagnosisCode,
  checks: GoogleSetupDiagnosis["checks"],
  fixSteps: string[]
): GoogleSetupDiagnosis {
  return {
    overall: code === "READY" ? "ready" : code === "TOKEN_STORE_UNAVAILABLE" ? "blocked" : "needs_action",
    primaryCode: code,
    checks,
    fixSteps
  };
}

export async function diagnoseGoogleSetup(
  environment: NodeJS.ProcessEnv,
  oauth: StatusProvider,
  tokenStore: Pick<TokenStore, "get">
): Promise<GoogleSetupDiagnosis> {
  const path = environment.GOOGLE_OAUTH_CREDENTIALS_FILE?.trim();
  const base: GoogleSetupDiagnosis["checks"] = {
    extensionLoaded: true,
    platform: process.platform,
    architecture: process.arch,
    credentialsSelected: Boolean(path),
    credentialFileReadable: false,
    credentialJsonValid: false,
    credentialType: "unknown",
    requiredFieldsPresent: false,
    loopbackRedirectReady: false,
    tokenStoreReady: false,
    tokenPresent: false,
    googleConnected: false,
    readOnlyScopeGranted: false
  };

  if (!path) {
    return result("CREDENTIAL_FILE_NOT_SELECTED", base, [
      "เปิด Claude Desktop > Settings > Extensions > PiR2-Sheets-Reader > Configure",
      "เลือกไฟล์ OAuth JSON ที่ดาวน์โหลดจาก Google Cloud และกด Save",
      "ถ้ายังไม่เห็น tool ให้ Quit Claude Desktop แล้วเปิดใหม่หนึ่งครั้ง"
    ]);
  }

  const inspection = await inspectDesktopCredentialFile(path);
  Object.assign(base, {
    credentialFileReadable: inspection.readable,
    credentialJsonValid: inspection.jsonValid,
    credentialType: inspection.credentialType,
    requiredFieldsPresent: inspection.requiredFieldsPresent,
    loopbackRedirectReady: inspection.loopbackRedirectReady
  });

  if (!inspection.readable) return result("CREDENTIAL_FILE_UNREADABLE", base, ["เปิด Configure แล้วเลือกไฟล์ OAuth JSON ใหม่จากโฟลเดอร์ Downloads", "ตรวจว่าไฟล์ยังอยู่และเปิดอ่านได้ แล้วกด Save"]);
  if (!inspection.jsonValid) return result("CREDENTIAL_JSON_INVALID", base, ["ดาวน์โหลด OAuth client JSON ใหม่จาก Google Cloud", "ห้ามเปิด แก้ชื่อ field หรือคัดลอกเนื้อหาเอง ให้เลือกไฟล์ที่ดาวน์โหลดมาโดยตรง"]);
  if (inspection.credentialType === "web") return result("OAUTH_CLIENT_MUST_BE_DESKTOP", base, ["กลับไป Google Cloud > Google Auth Platform > Clients", "สร้าง Client ใหม่โดยเลือก Application type = Desktop app", "ดาวน์โหลด JSON ใหม่ แล้วเลือกไฟล์ใหม่นั้นใน Configure"]);
  if (!inspection.requiredFieldsPresent) return result("OAUTH_FIELDS_INVALID", base, ["สร้าง OAuth Client แบบ Desktop app ใหม่", "ดาวน์โหลด JSON ใหม่จาก Google Cloud แล้วเลือกไฟล์นั้นใน Configure"]);
  if (!inspection.loopbackRedirectReady) return result("LOOPBACK_REDIRECT_MISSING", base, ["สร้าง OAuth Client ใหม่โดยเลือก Desktop app แทน Web application", "ดาวน์โหลด JSON ใหม่ แล้วเลือกไฟล์ใหม่ใน Configure"]);

  let credentials;
  try {
    credentials = await loadDesktopCredentials(path);
    const stored = await tokenStore.get(credentials.clientId);
    base.tokenStoreReady = true;
    base.tokenPresent = stored !== null;
  } catch {
    return result("TOKEN_STORE_UNAVAILABLE", base, ["ปลดล็อก Keychain บน macOS หรือ Credential Manager บน Windows", "Quit Claude Desktop ให้หมด แล้วเปิดใหม่", "รัน ตรวจ Sheets MCP ให้หน่อย อีกครั้ง"]);
  }

  let status: AuthStatus;
  try {
    status = await oauth.status();
  } catch {
    return result("GOOGLE_NOT_CONNECTED", base, ["พิมพ์ เชื่อม Google Sheets ให้หน่อย ใน Chat ใหม่", "ทำขั้นตอน consent ใน Browser ให้จบ", "กลับมาพิมพ์ ตรวจ Sheets MCP ให้หน่อย"]);
  }
  base.googleConnected = status.status === "connected";
  base.readOnlyScopeGranted = status.scopeGranted;

  if (status.status === "reconnect_required") return result("GOOGLE_RECONNECT_REQUIRED", base, ["พิมพ์ เชื่อม Google Sheets ใหม่ให้หน่อย", "อนุญาตเฉพาะสิทธิ์อ่าน Google Sheet", "กลับมาพิมพ์ ตรวจ Sheets MCP ให้หน่อย"]);
  if (!base.googleConnected || !base.readOnlyScopeGranted) return result("GOOGLE_NOT_CONNECTED", base, ["พิมพ์ เชื่อม Google Sheets ให้หน่อย", "ทำขั้นตอน consent ใน Browser ให้จบ", "กลับมาพิมพ์ ตรวจ Sheets MCP ให้หน่อย"]);
  return result("READY", base, ["พร้อมอ่าน Google Sheet แบบ read-only แล้วครับ"]);
}
