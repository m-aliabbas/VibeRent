import { sqlite } from "@/db/connection";
import type { RequestContext } from "@/server/context/request-context";
import { createAgencyPortableBackup, restoreAgencyPortableBackup } from "@/server/services/agency-portable-backup-service";

const context: RequestContext = {
  requestId: "req_portable_backup_check",
  userId: "usr-demo-owner",
  agencyId: "agy-viberent",
  roles: ["agency_owner"],
};

async function main() {
  const backup = await createAgencyPortableBackup(context);
  if (!backup.bytes.length || backup.manifest.agencyId !== context.agencyId) throw new Error("Portable backup was not created.");
  const file = new File([new Uint8Array(backup.bytes)], backup.fileName, { type: "application/vnd.sqlite3" });
  const restored = await restoreAgencyPortableBackup(context, file, context.agencyId);
  if (!restored.restored.agencies || !restored.restored.bookings) throw new Error("Portable backup rows were not restored.");
  sqlite.prepare("DELETE FROM audit_events WHERE agency_id=? AND action='agency.backup_restored' AND actor_id=?").run(context.agencyId, context.userId);
  console.log(JSON.stringify({ ok: true, bytes: backup.bytes.length, tables: backup.manifest.tables, restored: restored.restored }, null, 2));
  sqlite.close();
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
