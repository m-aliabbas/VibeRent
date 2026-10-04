import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDirectory } from "@/server/desktop/runtime-paths";

type EncryptedPayload = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

async function getLocalKey() {
  const keyPath = path.join(getDataDirectory(), ".secrets", "local.key");
  try {
    const key = await readFile(keyPath);
    if (key.length === 32) return key;
  } catch {}

  await mkdir(path.dirname(keyPath), { recursive: true });
  const key = randomBytes(32);
  await writeFile(keyPath, key, { flag: "wx", mode: 0o600 }).catch(async error => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  });
  return readFile(keyPath);
}

export async function writeEncryptedJson(filePath: string, value: unknown) {
  const key = await getLocalKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const payload: EncryptedPayload = {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(payload), { mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(temporaryPath, filePath);
}

export async function readEncryptedJson<T>(filePath: string): Promise<T | null> {
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8")) as EncryptedPayload;
    if (payload.version !== 1) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await getLocalKey(),
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}
