import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { applyPendingRestore, createBackup } from "@/server/desktop/backup-service";
import { startBackupScheduler } from "@/server/desktop/backup-scheduler";
import { refreshDesktopLicense, startLicenseRefreshScheduler } from "@/server/desktop/license-service";
import { ensureDesktopAuthSecret } from "@/server/desktop/local-crypto";

/** Restores, migrates and licenses the desktop database. Background jobs start afterwards. */
export async function prepareDesktopRuntime(): Promise<{ licensed: boolean }> {
  await ensureDesktopAuthSecret();
  const restored = await applyPendingRestore();
  if (restored) console.info(JSON.stringify({ event: "desktop.restore.applied", source: restored.sourceFilename }));

  const { db } = await import("@/db/connection");
  const { sqlite } = await import("@/db/connection");
  const migrationsFolder = process.env.VIBERENT_MIGRATIONS_DIR?.trim() || path.join(process.cwd(), "drizzle");
  const migrationFiles = readMigrationFiles({ migrationsFolder });
  const migrationTable = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type=? AND name=? LIMIT 1")
    .get("table", "__drizzle_migrations");
  const lastMigration = migrationTable
    ? sqlite.prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1").get() as { created_at: number } | undefined
    : undefined;
  const pendingMigrations = migrationFiles.filter(
    migration => !lastMigration || Number(lastMigration.created_at) < migration.folderMillis,
  );
  const hasClientTables = sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'__drizzle_migrations' LIMIT 1",
  ).get();
  if (pendingMigrations.length > 0 && hasClientTables) {
    const backup = await createBackup("pre-migration");
    console.info(JSON.stringify({ event: "desktop.migration.backup_created", filename: backup.filename }));
  }
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder });
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
  if (sqlite.pragma("integrity_check", { simple: true }) !== "ok") {
    throw new Error("The database failed its integrity check after migration.");
  }
  const foreignKeyViolations = sqlite.pragma("foreign_key_check") as unknown[];
  if (foreignKeyViolations.length > 0) {
    throw new Error(`The database has ${foreignKeyViolations.length} foreign-key violation(s) after migration.`);
  }
  if (pendingMigrations.length > 0) {
    console.info(JSON.stringify({ event: "desktop.migration.applied", count: pendingMigrations.length }));
  }
  if (restored?.actor) {
    const actor = sqlite.prepare("SELECT id FROM users WHERE agency_id=? AND id=? LIMIT 1")
      .get(restored.actor.agencyId, restored.actor.userId) as { id: string } | undefined;
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        `aud_${randomUUID()}`,
        restored.actor.agencyId,
        actor?.id ?? null,
        "backup.restore_applied",
        "agency",
        restored.actor.agencyId,
        JSON.stringify({ sourceFilename: restored.sourceFilename, safetyBackup: restored.safetyBackup }),
        new Date().toISOString(),
      );
  }

  const license = await refreshDesktopLicense();
  startLicenseRefreshScheduler();
  const licensed = !license.enforced || license.state === "active";
  if (licensed) startBackupScheduler();
  console.info(JSON.stringify({ event: "desktop.ready", license: license.state }));
  return { licensed };
}
