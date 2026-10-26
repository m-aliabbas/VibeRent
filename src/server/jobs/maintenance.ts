import "server-only";

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getDatabaseTarget } from "@/db/database-target";
import { execute } from "@/db/query";
import { getWhatsAppImageInboxPath } from "@/server/desktop/runtime-paths";

const failedJobRetentionMs = 30 * 24 * 60 * 60 * 1000;
const inboxRetentionMs = 24 * 60 * 60 * 1000;

/** Hourly housekeeping that used to run on every write. */
export async function runMaintenance() {
  const now = Date.now();
  if (getDatabaseTarget() === "postgres") {
    const { messageCacheRetentionMs } = await import("@/server/whatsapp/postgres-auth-store");
    await execute("DELETE FROM whatsapp_message_cache WHERE created_at<?", [new Date(now - messageCacheRetentionMs).toISOString()]);
  } else {
    // pg-boss keeps its own retention; the SQLite queue keeps failed jobs for inspection, then drops them.
    await execute("DELETE FROM background_jobs WHERE status='failed' AND updated_at<?", [new Date(now - failedJobRetentionMs).toISOString()]);
  }
  await removeStaleInboxFiles(getWhatsAppImageInboxPath(), now - inboxRetentionMs);
}

/** CNIC photos the gateway saved for a job that never completed. */
async function removeStaleInboxFiles(directory: string, olderThan: number) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await removeStaleInboxFiles(target, olderThan);
    else if ((await stat(target)).mtimeMs < olderThan) await unlink(target).catch(() => undefined);
  }
}
