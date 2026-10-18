import { apiHandler, readOptionalJsonObject } from "@/server/api/route";
import { startBooking } from "@/server/services/booking-service";

export const runtime = "nodejs";

/** Reserves a booking number (or returns the caller's still-active draft when `existingDraftId` is sent). */
export const POST = apiHandler(async ({ request, context }) => {
  const body = await readOptionalJsonObject(request);
  return startBooking(context, typeof body.existingDraftId === "string" ? body.existingDraftId : undefined);
}, { status: 201 });
