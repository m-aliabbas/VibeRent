import { apiHandler } from "@/server/api/route";
import { getAgencyChangeCursor } from "@/server/services/change-feed-service";

export const runtime = "nodejs";

/**
 * Cheap "has anything changed?" probe for near-real-time clients. Returns an opaque `cursor`
 * that changes whenever bookings, vehicles, customers, payments or other audited records change
 * in the agency. Clients poll it (every few seconds while open) and refresh only when it moves.
 */
export const GET = apiHandler(({ context }) => getAgencyChangeCursor(context));
