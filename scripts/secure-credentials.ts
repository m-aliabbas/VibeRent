import { readFile, writeFile } from "node:fs/promises";
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

const input = argument("--input");
const output = argument("--output");
const key = argument("--key") || process.env.FIREBASE_CREDENTIALS_KEY || DEFAULT_ENCRYPTED_CREDENTIALS_KEY;

if (!input || !output) {
  throw new Error(
    "Usage: npm run credentials:encrypt -- --input <credential.json> --output <credential.json.enc> [--key <Fernet key>]",
  );
}

async function main(inputPath: string, outputPath: string) {
  const plaintext = await readFile(path.resolve(inputPath));
  JSON.parse(plaintext.toString("utf8"));
  await writeFile(path.resolve(outputPath), encryptFernet(plaintext, key), { mode: 0o600 });
  console.log(`Encrypted credential written to ${path.resolve(outputPath)}.`);
}

void main(input, output);
