import { apiHandler } from "@/server/api/route";
import { DomainError } from "@/server/domain/errors";
import { listNotifications } from "@/server/notifications/notification-service";

export const runtime = "nodejs";

/** Delivery history for one record, e.g. `?entityType=booking&entityId=bk_123`. Newest first, at most 50. */
export const GET = apiHandler(async ({ request, context }) => {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("entityType")?.trim();
  const entityId = params.get("entityId")?.trim();
  if (!entityType || !entityId) throw new DomainError("VALIDATION_FAILED", "entityType and entityId are required.", 400);
  return listNotifications(context, entityType, entityId);
});
