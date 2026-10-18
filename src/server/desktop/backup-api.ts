import "server-only";

import { randomUUID } from "node:crypto";
import { execute } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import { getApiRequestContext } from "@/server/auth/session";
import { isDesktopRuntime } from "@/server/desktop/runtime-paths";
import { DomainError } from "@/server/domain/errors";

export async function requireBackupAdministrator(request: Request) {
  const context = await getApiRequestContext(request);
  requireRole(context, ["agency_owner"]);
  if (!isDesktopRuntime()) {
    throw new DomainError("VALIDATION_FAILED", "Desktop backup and restore are available only in the Windows application. Use the web migration preview for Windows archives.", 400);
  }
  return context;
}

export async function recordBackupAudit(
  context: { agencyId: string; userId: string },
  action: string,
  metadata: Record<string, unknown>,
) {
  await execute(
    "INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      `aud_${randomUUID()}`,
      context.agencyId,
      context.userId,
      action,
      "agency",
      context.agencyId,
      JSON.stringify(metadata),
      new Date().toISOString(),
    ],
  );
}
