import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageDocument = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

console.log("Starting the real desktop license flow at http://localhost:3000/license");
console.log("This uses Firebase and registers this computer in viberent_licenses if it is not already present.");

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: root,
  env: {
    ...process.env,
    VIBERENT_DESKTOP: "1",
    LICENSE_ENFORCEMENT: "true",
    LICENSE_APPLICATION_ID: "viberent",
    LICENSE_AUTO_REGISTER: "true",
    FIREBASE_LICENSE_COLLECTION: "viberent_licenses",
    VIBERENT_VERSION: `${packageDocument.version}-web-test`,
    VIBERENT_DATA_DIR: path.join(root, ".data", "license-web-test"),
    AUTH_REQUIRE_EMAIL_VERIFICATION: "false",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", code => process.exit(code ?? 0));
