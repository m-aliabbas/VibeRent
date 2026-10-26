import { apiHandler } from "@/server/api/route";
import { resendAgreement } from "@/server/notifications/notices";

export const runtime = "nodejs";

/** Queues the rental agreement PDF again. The response reports `queued`; delivery status is on `/notifications`. */
export const POST = apiHandler<{ id: string }>(({ context, params }) => resendAgreement(context, params.id));
