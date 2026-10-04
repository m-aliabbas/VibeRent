import { copyFile, cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const binDirectory = path.join(root, "src-tauri", "bin");

async function requirePath(target, message) {
  try { await stat(target); }
  catch { throw new Error(message); }
}

await requirePath(path.join(standalone, "server.js"), "Run `npm run build` before packaging the desktop server.");
await mkdir(binDirectory, { recursive: true });

for (const [source, destination] of [
  [path.join(root, ".next", "static"), path.join(standalone, ".next", "static")],
  [path.join(root, "public"), path.join(standalone, "public")],
  [path.join(root, "drizzle"), path.join(standalone, "drizzle")],
]) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}

const triple = process.platform === "win32"
  ? "x86_64-pc-windows-msvc"
  : process.platform === "darwin"
    ? (process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin")
    : "x86_64-unknown-linux-gnu";
const extension = process.platform === "win32" ? ".exe" : "";
const sidecar = path.join(binDirectory, `next-server-${triple}${extension}`);
await rm(sidecar, { force: true });
await copyFile(process.execPath, sidecar);

const packagedEnv = path.join(binDirectory, ".env");
const localEnv = path.join(root, "desktop", ".env");
try {
  await stat(packagedEnv);
} catch {
  await requirePath(localEnv, "Create desktop/.env from desktop/.env.example before a local Tauri build.");
  await copyFile(localEnv, packagedEnv);
}

console.log(`Desktop resources prepared for ${triple}.`);
