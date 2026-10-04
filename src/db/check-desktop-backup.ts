import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const phase = process.argv[2];

async function main() {
if (phase === "prepare") {
  const { sqlite } = await import("@/db/connection");
  const { createBackup, stageRestore } = await import("@/server/desktop/backup-service");
  const { getPrivateFileRoot } = await import("@/server/desktop/runtime-paths");
  const attachment = path.join(getPrivateFileRoot(), "agy-viberent", "desktop-backup-check.txt");
  await mkdir(path.dirname(attachment), { recursive: true });
  await writeFile(attachment, "restored attachment", "utf8");
  const originalAgency = sqlite.prepare("SELECT name FROM agencies WHERE id='agy-viberent'").get() as { name: string } | undefined;
  if (!originalAgency) throw new Error("Seeded agency was not found.");
  const backup = await createBackup("manual");
  sqlite.prepare("UPDATE agencies SET name='MUTATED AFTER BACKUP' WHERE id='agy-viberent'").run();
  await rm(attachment, { force: true });
  await stageRestore(backup.path, backup.filename, { agencyId: "agy-viberent", userId: "usr-demo-owner" });
  await writeFile(path.join(process.env.VIBERENT_DATA_DIR!, "expected-agency-name.txt"), originalAgency.name, "utf8");
  sqlite.close();
} else if (phase === "apply") {
  const { applyPendingRestore } = await import("@/server/desktop/backup-service");
  const restored = await applyPendingRestore();
  if (!restored) throw new Error("No pending restore was applied.");
  const { sqlite } = await import("@/db/connection");
  const { getPrivateFileRoot } = await import("@/server/desktop/runtime-paths");
  const expected = await readFile(path.join(process.env.VIBERENT_DATA_DIR!, "expected-agency-name.txt"), "utf8");
  const agency = sqlite.prepare("SELECT name FROM agencies WHERE id='agy-viberent'").get() as { name: string } | undefined;
  if (agency?.name !== expected) throw new Error("The restored database does not match the snapshot.");
  const attachment = await readFile(path.join(getPrivateFileRoot(), "agy-viberent", "desktop-backup-check.txt"), "utf8");
  if (attachment !== "restored attachment") throw new Error("Private files were not restored with the database.");
  if (sqlite.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Restored database integrity check failed.");
  sqlite.close();
} else {
  throw new Error("Use the prepare or apply phase.");
}
}

void main();
