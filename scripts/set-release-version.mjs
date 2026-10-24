import fs from "node:fs";
import path from "node:path";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: npm run release:set -- 1.2.3");
  process.exit(1);
}
const root = process.cwd();
for (const filename of ["package.json", "package-lock.json"]) {
  const filePath = path.join(root, filename);
  const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  document.version = version;
  if (filename === "package-lock.json" && document.packages?.[""]) document.packages[""].version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
}
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.version = version;
fs.writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);
const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
fs.writeFileSync(cargoPath, fs.readFileSync(cargoPath, "utf8").replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`));
const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");
const cargoLock = fs.readFileSync(cargoLockPath, "utf8");
const updatedCargoLock = cargoLock.replace(/(\[\[package\]\]\s+name = "viberent"\s+version = ")[^"]+("\s+)/, (_, prefix, suffix) => `${prefix}${version}${suffix}`);
if (updatedCargoLock === cargoLock && !cargoLock.includes(`name = "viberent"\nversion = "${version}"`)) {
  throw new Error("Could not find the VibeRent package in Cargo.lock.");
}
fs.writeFileSync(cargoLockPath, updatedCargoLock);
console.log(`Set VibeRent release version to ${version}.`);
