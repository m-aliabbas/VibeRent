import { apiHandler } from "@/server/api/route";
import { clearBookingDraft } from "@/server/services/booking-cnic-service";
import { startBooking } from "@/server/services/booking-service";

export const runtime = "nodejs";

/** Discards a draft (and its CNIC uploads) and returns a fresh draft, matching the web "clear" button. */
export const DELETE = apiHandler<{ draftId: string }>(async ({ context, params }) => {
  await clearBookingDraft(context, params.draftId);
  return startBooking(context);
});
