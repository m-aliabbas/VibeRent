import "server-only";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export function listActivity(context: RequestContext, before?: string, requestedLimit = 30) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  if (before && !Number.isFinite(Date.parse(before))) throw new DomainError("VALIDATION_FAILED", "Invalid activity cursor.", 400, { before: "Use an ISO 8601 timestamp." });
  const limit = Math.min(100, Math.max(1, Number.isInteger(requestedLimit) ? requestedLimit : 30));
  const rows = sqlite.prepare(`SELECT id, action, entity_type AS entityType, entity_id AS entityId, metadata, occurred_at AS occurredAt FROM audit_events WHERE agency_id=? AND (? IS NULL OR occurred_at < ?) ORDER BY occurred_at DESC, id DESC LIMIT ?`).all(context.agencyId, before ?? null, before ?? null, limit + 1) as Array<{ id: string; metadata: string | Record<string, unknown> | null; occurredAt: string } & Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((row) => ({ ...row, metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata ?? {} }));
  return { items: data, nextCursor: hasMore ? data.at(-1)?.occurredAt ?? null : null };
}
