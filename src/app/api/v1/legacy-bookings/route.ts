import { apiHandler, readJsonObject } from "@/server/api/route";
import { recordLegacyBooking, type LegacyBookingInput } from "@/server/services/legacy-entry-service";

export const runtime = "nodejs";

/**
 * Records a completed historical booking with its payment and an optional expense.
 * Body: `{ vehicleId, customerId, pickupAt, returnAt, totalAmount, receivedAmount, paymentMethod, expense? }`.
 * Returns `{ id, publicNumber }`.
 */
export const POST = apiHandler(async ({ request, context }) =>
  recordLegacyBooking(context, await readJsonObject(request) as LegacyBookingInput), { status: 201, revalidate: true });
