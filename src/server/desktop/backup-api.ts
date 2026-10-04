import "server-only";

import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import { getApiRequestContext } from "@/server/auth/session";

export async function requireBackupAdministrator(request: Request) {
  const context = await getApiRequestContext(request);
  requireRole(context, ["agency_owner"]);
  return context;
}

export function recordBackupAudit(
  context: { agencyId: string; userId: string },
  action: string,
  metadata: Record<string, unknown>,
) {
  sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(
      `aud_${randomUUID()}`,
      context.agencyId,
      context.userId,
      action,
      "agency",
      context.agencyId,
      JSON.stringify(metadata),
      new Date().toISOString(),
    );
}
