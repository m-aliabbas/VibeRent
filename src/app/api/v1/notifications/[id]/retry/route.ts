import { apiHandler } from "@/server/api/route";
import { retryNotification } from "@/server/notifications/notification-service";

export const runtime = "nodejs";

/** Queues a failed delivery again. */
export const POST = apiHandler<{ id: string }>(({ context, params }) => retryNotification(context, params.id));
