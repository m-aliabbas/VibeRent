import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(os.tmpdir(), "viberent-desktop-check-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
mkdirSync(path.join(root, "data"), { recursive: true });
const environment = {
  ...process.env,
  NODE_OPTIONS: "--conditions=react-server",
  VIBERENT_DESKTOP: "1",
  LICENSE_ENFORCEMENT: "false",
  VIBERENT_DATA_DIR: path.join(root, "data"),
  DATABASE_URL: path.join(root, "data", "viberent.db"),
  PRIVATE_FILE_STORAGE_ROOT: path.join(root, "data", "private-files"),
  BACKUP_ROOT: path.join(root, "backups"),
};

function run(args) {
  const result = spawnSync(npm, args, { cwd: process.cwd(), env: environment, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${npm} ${args.join(" ")} failed.`);
  }
}

try {
  run(["run", "db:migrate"]);
  run(["run", "db:seed"]);
  run(["exec", "--", "tsx", "src/db/check-desktop-backup.ts", "prepare"]);
  run(["exec", "--", "tsx", "src/db/check-desktop-backup.ts", "apply"]);
  console.log(JSON.stringify({ ok: true, archiveCreated: true, restoreStaged: true, restoreAppliedOnRestart: true, privateFilesRestored: true }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
