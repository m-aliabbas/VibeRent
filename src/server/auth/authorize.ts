import type { RequestContext, StaffRole } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export function requireRole(context: RequestContext, allowed: StaffRole[]) {
  if (!context.roles.some((role) => allowed.includes(role))) {
    throw new DomainError("FORBIDDEN", "You do not have permission to perform this action.", 403);
  }
}

