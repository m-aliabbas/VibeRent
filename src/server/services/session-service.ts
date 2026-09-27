import "server-only";
import { sqlite } from "@/db/connection";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export function getCurrentSession(context: RequestContext) {
  const user = sqlite.prepare(`SELECT u.id, u.name, u.email, u.role, u.branch_id AS branchId, a.id AS agencyId, a.name AS agencyName, a.currency, a.timezone FROM users u JOIN agencies a ON a.id=u.agency_id WHERE u.agency_id=? AND u.id=? AND u.active=1 LIMIT 1`).get(context.agencyId, context.userId) as Record<string, unknown> | undefined;
  if (!user) throw new DomainError("UNAUTHENTICATED", "The authenticated user is not active.", 401);
  const branches = sqlite.prepare(`SELECT id, name, city FROM branches WHERE agency_id=? AND active=1 ORDER BY name`).all(context.agencyId);
  return { user, roles: context.roles, branches };
}
