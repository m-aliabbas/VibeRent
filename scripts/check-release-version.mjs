import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const tauriVersion = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8")).version;
const cargo = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = { "package.json": packageVersion, "src-tauri/tauri.conf.json": tauriVersion, "src-tauri/Cargo.toml": cargoVersion };
if (new Set(Object.values(versions)).size !== 1) {
  console.error("Release versions do not match:", versions);
  process.exit(1);
}
const tag = process.argv[2];
if (tag && tag !== `v${packageVersion}`) {
  console.error(`Release tag ${tag} does not match v${packageVersion}.`);
  process.exit(1);
}
console.log(`Release version ${packageVersion} is consistent.`);
