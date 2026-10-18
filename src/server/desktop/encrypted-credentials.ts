import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_ENCRYPTED_CREDENTIALS_KEY,
  decryptFernetJson,
} from "@/server/desktop/fernet";

const DEFAULT_FIREBASE_FILENAME = "k1.json.enc";
const DEFAULT_GOOGLE_DRIVE_FILENAME = "g1.json.enc";
const DEFAULT_GOOGLE_DRIVE_WEB_FILENAME = "g1-web.json.enc";
const DEFAULT_OPENAI_FILENAME = "o1.json.enc";

export type FirebaseServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

export type GoogleOAuthClient = {
  client_id?: string;
  client_secret?: string;
  auth_uri?: string;
  token_uri?: string;
  redirect_uris?: string[];
};

type GoogleOAuthDocument = {
  installed?: GoogleOAuthClient;
  web?: GoogleOAuthClient;
};

type OpenAiCredentialDocument = {
  api_key?: string;
};

export class EncryptedCredentialError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EncryptedCredentialError";
  }
}

export function getEncryptedCredentialsKey() {
  return process.env.FIREBASE_CREDENTIALS_KEY?.trim() || DEFAULT_ENCRYPTED_CREDENTIALS_KEY;
}

function candidatePaths(configuredPath: string | undefined, filename: string) {
  const configured = configuredPath?.trim();
  const candidates = configured
    ? [path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured)]
    : [];
  candidates.push(
    path.resolve(process.cwd(), filename),
    path.resolve(process.cwd(), "credentials", filename),
    path.resolve(path.dirname(process.execPath), filename),
  );
  return [...new Set(candidates)];
}

async function loadEncryptedJson<T>(configuredPath: string | undefined, filename: string, label: string) {
  let encrypted: Buffer | null = null;
  for (const candidate of candidatePaths(configuredPath, filename)) {
    try {
      encrypted = await readFile(candidate);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new EncryptedCredentialError(`${label} credentials could not be read.`, { cause: error });
      }
    }
  }
  if (!encrypted) {
    throw new EncryptedCredentialError(`${label} credentials are not configured in this build.`);
  }
  try {
    return decryptFernetJson<T>(encrypted, getEncryptedCredentialsKey());
  } catch (error) {
    throw new EncryptedCredentialError(`${label} credentials could not be decrypted.`, { cause: error });
  }
}

let firebaseCredentialsPromise: Promise<FirebaseServiceAccount> | undefined;

export function loadFirebaseCredentials() {
  firebaseCredentialsPromise ??= loadEncryptedJson<FirebaseServiceAccount>(
    process.env.FIREBASE_CREDENTIALS_ENC_PATH,
    DEFAULT_FIREBASE_FILENAME,
    "Firebase",
  ).then(credentials => {
    if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
      throw new EncryptedCredentialError("Firebase credentials are incomplete.");
    }
    return credentials;
  });
  return firebaseCredentialsPromise;
}

let googleClientPromise: Promise<GoogleOAuthClient> | undefined;

export function loadGoogleDriveClient() {
  googleClientPromise ??= loadEncryptedJson<GoogleOAuthDocument>(
    process.env.GOOGLE_DRIVE_CLIENT_CONFIG_ENC_PATH,
    DEFAULT_GOOGLE_DRIVE_FILENAME,
    "Google Drive",
  ).then(document => {
    const client = document.installed ?? document.web;
    if (!client?.client_id || !client.client_secret || !client.auth_uri || !client.token_uri) {
      throw new EncryptedCredentialError("Google Drive credentials are incomplete.");
    }
    return client;
  });
  return googleClientPromise;
}

let googleWebClientPromise: Promise<GoogleOAuthClient> | undefined;

export function loadGoogleDriveWebClient() {
  googleWebClientPromise ??= loadEncryptedJson<GoogleOAuthDocument>(
    process.env.GOOGLE_DRIVE_WEB_CLIENT_CONFIG_ENC_PATH,
    DEFAULT_GOOGLE_DRIVE_WEB_FILENAME,
    "Google Drive web",
  ).then(document => {
    const client = document.web;
    if (!client?.client_id || !client.client_secret || !client.auth_uri || !client.token_uri) {
      throw new EncryptedCredentialError("Google Drive web credentials are incomplete.");
    }
    return client;
  });
  return googleWebClientPromise;
}

let openAiApiKeyPromise: Promise<string> | undefined;

export function loadOpenAiApiKey() {
  openAiApiKeyPromise ??= loadEncryptedJson<OpenAiCredentialDocument>(
    process.env.OPENAI_CREDENTIALS_ENC_PATH,
    DEFAULT_OPENAI_FILENAME,
    "OpenAI",
  ).then(document => {
    const apiKey = document.api_key?.trim();
    if (!apiKey) {
      throw new EncryptedCredentialError("OpenAI credentials are incomplete.");
    }
    return apiKey;
  });
  return openAiApiKeyPromise;
}
