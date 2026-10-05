import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { applyPendingRestore } from "@/server/desktop/backup-service";
import { startBackupScheduler } from "@/server/desktop/backup-scheduler";
import { refreshDesktopLicense, startLicenseRefreshScheduler } from "@/server/desktop/license-service";
import { ensureDesktopAuthSecret } from "@/server/desktop/local-crypto";

export async function prepareDesktopRuntime() {
  await ensureDesktopAuthSecret();
  const restored = await applyPendingRestore();
  if (restored) console.info(JSON.stringify({ event: "desktop.restore.applied", source: restored.sourceFilename }));

  const { db } = await import("@/db/connection");
  const migrationsFolder = process.env.VIBERENT_MIGRATIONS_DIR?.trim() || path.join(process.cwd(), "drizzle");
  migrate(db, { migrationsFolder });
  if (restored?.actor) {
    const { sqlite } = await import("@/db/connection");
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
  if (!license.enforced || license.state === "active") {
    startBackupScheduler();
    const { startConfiguredWhatsAppRuntimes } = await import("@/server/services/whatsapp-settings-service");
    await startConfiguredWhatsAppRuntimes();
  }
  console.info(JSON.stringify({ event: "desktop.ready", license: license.state }));
}
