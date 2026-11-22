import { apiHandler, readJsonObject } from "@/server/api/route";
import { removeBookingCharge, saveBookingCharge } from "@/server/services/booking-service";

export const runtime = "nodejs";

/** Edits a trip charge. Body: `{ kind, description, amount }`. */
export const PUT = apiHandler<{ id: string; chargeId: string }>(async ({ request, context, params }) =>
  saveBookingCharge(context, params.id, { ...await readJsonObject(request), id: params.chargeId }), { revalidate: true });

export const DELETE = apiHandler<{ id: string; chargeId: string }>(async ({ context, params }) =>
  removeBookingCharge(context, params.id, params.chargeId), { revalidate: true });
