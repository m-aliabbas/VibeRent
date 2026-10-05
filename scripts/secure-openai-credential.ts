import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  DEFAULT_ENCRYPTED_CREDENTIALS_KEY,
  encryptFernet,
} from "../src/server/desktop/fernet";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  loadEnvConfig(process.cwd());

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the local environment.");
  }

  const output = path.resolve(argument("--output") ?? "o1.json.enc");
  const encryptionKey = process.env.FIREBASE_CREDENTIALS_KEY?.trim()
    || DEFAULT_ENCRYPTED_CREDENTIALS_KEY;
  const document = JSON.stringify({ api_key: apiKey });

  await writeFile(output, encryptFernet(document, encryptionKey), { mode: 0o600 });
  console.log(`Encrypted OpenAI credential written to ${output}.`);
}

void main();
