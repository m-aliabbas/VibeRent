import { apiHandler } from "@/server/api/route";
import { archiveKind } from "@/server/api/archive-kind";
import { permanentlyDeleteArchived } from "@/server/services/archive-service";

export const runtime = "nodejs";

/**
 * Permanently deletes an archived record. This cannot be undone; confirm with the user first.
 * For vehicles, `?deleteHistory=true` also deletes linked bookings, payments, expenses, and payouts;
 * otherwise the vehicle is hidden and its history stays in ledgers.
 */
export const DELETE = apiHandler<{ kind: string; id: string }>(({ request, context, params }) =>
  permanentlyDeleteArchived(context, archiveKind(params.kind), params.id, { deleteHistory: new URL(request.url).searchParams.get("deleteHistory") === "true" }), { revalidate: true });
