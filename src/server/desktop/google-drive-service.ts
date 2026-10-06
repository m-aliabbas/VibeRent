import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { CodeChallengeMethod, OAuth2Client, type Credentials } from "google-auth-library";
import { drive as createDriveClient } from "googleapis/build/src/apis/drive";
import {
  EncryptedCredentialError,
  loadGoogleDriveClient,
} from "@/server/desktop/encrypted-credentials";
import { readEncryptedJson, writeEncryptedJson } from "@/server/desktop/local-crypto";
import { getGoogleDriveSessionPath } from "@/server/desktop/runtime-paths";
import { DomainError } from "@/server/domain/errors";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "VibeRent Backups";

type DriveSession = {
  credentials: Credentials;
  account?: { displayName?: string | null; email?: string | null };
};

type OAuthState = { value: string; expiresAt: number; codeVerifier: string };

export class GoogleDriveBackupError extends DomainError {
  constructor(message: string) {
    super("VALIDATION_FAILED", message, 400);
    this.name = "GoogleDriveBackupError";
  }
}

export function resolveGoogleDriveRedirectUri(configuredUrl?: string, applicationUrl?: string) {
  try {
    const source = configuredUrl?.trim() || applicationUrl?.trim() || "http://127.0.0.1:4322";
    const url = new URL(source);
    if (url.protocol !== "http:") throw new Error("Desktop OAuth requires an HTTP loopback URL.");
    return `http://127.0.0.1${url.port ? `:${url.port}` : ""}`;
  } catch {
    throw new GoogleDriveBackupError("The Google Drive redirect URL is invalid.");
  }
}

function redirectUri() {
  return resolveGoogleDriveRedirectUri(
    process.env.GOOGLE_DRIVE_REDIRECT_URI,
    process.env.BETTER_AUTH_URL,
  );
}

async function oauthClient() {
  try {
    const client = await loadGoogleDriveClient();
    return new OAuth2Client(client.client_id, client.client_secret, redirectUri());
  } catch (error) {
    if (error instanceof EncryptedCredentialError) {
      throw new GoogleDriveBackupError(error.message);
    }
    throw error;
  }
}

function oauthStatePath() {
  return `${getGoogleDriveSessionPath()}.oauth-state`;
}

export async function getGoogleDriveStatus() {
  let configured = true;
  try {
    await loadGoogleDriveClient();
  } catch {
    configured = false;
  }
  const session = configured ? await readEncryptedJson<DriveSession>(getGoogleDriveSessionPath()) : null;
  return {
    configured,
    connected: Boolean(session?.credentials?.refresh_token),
    account: session?.account ?? null,
    folderName: FOLDER_NAME,
  };
}

export async function createGoogleDriveAuthorization() {
  const client = await oauthClient();
  const value = crypto.randomUUID();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  await writeEncryptedJson(oauthStatePath(), {
    value,
    expiresAt: Date.now() + 10 * 60 * 1000,
    codeVerifier,
  } satisfies OAuthState);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
    state: value,
    include_granted_scopes: true,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}

export async function completeGoogleDriveAuthorization(code: string, state: string) {
  const expected = await readEncryptedJson<OAuthState>(oauthStatePath());
  await rm(oauthStatePath(), { force: true });
  if (!expected || expected.expiresAt < Date.now() || expected.value !== state) {
    throw new GoogleDriveBackupError("The Google Drive sign-in request expired or is invalid.");
  }

  const client = await oauthClient();
  const { tokens } = await client.getToken({ code, codeVerifier: expected.codeVerifier });
  if (!tokens.refresh_token) {
    throw new GoogleDriveBackupError("Google did not return long-term backup access. Disconnect and try again.");
  }
  client.setCredentials(tokens);
  const drive = createDriveClient({ version: "v3", auth: client });
  const about = await drive.about.get({ fields: "user(displayName,emailAddress)" });
  const session: DriveSession = {
    credentials: tokens,
    account: {
      displayName: about.data.user?.displayName,
      email: about.data.user?.emailAddress,
    },
  };
  await writeEncryptedJson(getGoogleDriveSessionPath(), session);
  return getGoogleDriveStatus();
}

export async function disconnectGoogleDrive() {
  await rm(getGoogleDriveSessionPath(), { force: true });
  await rm(oauthStatePath(), { force: true });
  return getGoogleDriveStatus();
}

async function authenticatedDrive() {
  const sessionPath = getGoogleDriveSessionPath();
  const session = await readEncryptedJson<DriveSession>(sessionPath);
  if (!session?.credentials?.refresh_token) {
    throw new GoogleDriveBackupError("Connect a Google account before using cloud backups.");
  }
  const client = await oauthClient();
  client.setCredentials(session.credentials);
  client.on("tokens", tokens => {
    void writeEncryptedJson(sessionPath, {
      ...session,
      credentials: { ...session.credentials, ...tokens },
    } satisfies DriveSession);
  });
  return { drive: createDriveClient({ version: "v3", auth: client }), session };
}

async function getOrCreateFolder() {
  const { drive } = await authenticatedDrive();
  const escaped = FOLDER_NAME.replaceAll("'", "\\'");
  const existing = await drive.files.list({
    q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 10,
  });
  const folderId = existing.data.files?.find(file => file.id)?.id;
  if (folderId) return { drive, folderId };
  const created = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  if (!created.data.id) throw new GoogleDriveBackupError("Google Drive did not create the backup folder.");
  return { drive, folderId: created.data.id };
}

export async function uploadBackupToGoogleDrive(backupPath: string) {
  const { drive, folderId } = await getOrCreateFolder();
  const result = await drive.files.create({
    requestBody: { name: path.basename(backupPath), parents: [folderId] },
    media: { mimeType: "application/gzip", body: createReadStream(backupPath) },
    fields: "id,name,createdTime,size",
  });
  return {
    fileId: result.data.id,
    filename: result.data.name,
    createdAt: result.data.createdTime,
    size: Number(result.data.size || 0),
    folderName: FOLDER_NAME,
  };
}

export async function listGoogleDriveBackups() {
  const { drive, folderId } = await getOrCreateFolder();
  const result = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name contains '.viberent-backup.tgz'`,
    orderBy: "createdTime desc",
    fields: "files(id,name,createdTime,size)",
    pageSize: 50,
  });
  return (result.data.files || []).flatMap(file => file.id && file.name ? [{
    fileId: file.id,
    filename: file.name,
    createdAt: file.createdTime || null,
    size: Number(file.size || 0),
  }] : []);
}

export async function downloadGoogleDriveBackup(fileId: string, destination: string) {
  const { drive, folderId } = await getOrCreateFolder();
  const metadata = await drive.files.get({ fileId, fields: "id,name,size,parents,trashed" });
  const filename = metadata.data.name || "";
  const size = Number(metadata.data.size || 0);
  if (
    metadata.data.trashed
    || !metadata.data.parents?.includes(folderId)
    || !filename.endsWith(".viberent-backup.tgz")
    || size <= 0
    || size > 1024 * 1024 * 1024
  ) {
    throw new GoogleDriveBackupError("The selected Drive backup is invalid.");
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  await pipeline(response.data, createWriteStream(destination, { mode: 0o600 }));
  return { filename, size };
}
