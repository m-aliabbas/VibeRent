import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const FERNET_VERSION = 0x80;

// Kept compatible with the encrypted VibePOS desktop resources during the JS port.
export const DEFAULT_ENCRYPTED_CREDENTIALS_KEY = "EhKGefoVJZoKmg1ikyTppKbmryLi5DcvJcjIUx3zw40=";

function decodeKey(encodedKey: string) {
  const key = Buffer.from(encodedKey.trim(), "base64url");
  if (key.length !== 32) {
    throw new Error("The encrypted-credentials key must be a 32-byte URL-safe base64 value.");
  }
  return { signingKey: key.subarray(0, 16), encryptionKey: key.subarray(16) };
}

function encodeUrlSafe(value: Buffer) {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_");
}

export function encryptFernet(plaintext: Buffer | string, encodedKey: string) {
  const { signingKey, encryptionKey } = decodeKey(encodedKey);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext),
    cipher.final(),
  ]);
  const body = Buffer.concat([Buffer.from([FERNET_VERSION]), timestamp, iv, ciphertext]);
  const signature = createHmac("sha256", signingKey).update(body).digest();
  return encodeUrlSafe(Buffer.concat([body, signature]));
}

export function decryptFernet(token: Buffer | string, encodedKey: string) {
  const { signingKey, encryptionKey } = decodeKey(encodedKey);
  const encodedToken = (Buffer.isBuffer(token) ? token.toString("utf8") : token).trim();
  const decoded = Buffer.from(encodedToken, "base64url");
  if (decoded.length < 73 || decoded[0] !== FERNET_VERSION) {
    throw new Error("The encrypted credential is not a valid Fernet token.");
  }

  const body = decoded.subarray(0, -32);
  const actualSignature = decoded.subarray(-32);
  const expectedSignature = createHmac("sha256", signingKey).update(body).digest();
  if (!timingSafeEqual(actualSignature, expectedSignature)) {
    throw new Error("The encrypted credential could not be authenticated.");
  }

  const iv = decoded.subarray(9, 25);
  const ciphertext = decoded.subarray(25, -32);
  const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function decryptFernetJson<T>(token: Buffer | string, encodedKey: string): T {
  return JSON.parse(decryptFernet(token, encodedKey).toString("utf8")) as T;
}
