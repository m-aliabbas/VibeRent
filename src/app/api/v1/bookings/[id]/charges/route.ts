import { apiHandler, readJsonObject } from "@/server/api/route";
import { saveBookingCharge } from "@/server/services/booking-service";

export const runtime = "nodejs";

/** Adds a trip charge. Body: `{ kind: "toll"|"fuel"|"driver"|"parking"|"other", description, amount }`. */
export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  saveBookingCharge(context, params.id, await readJsonObject(request)), { revalidate: true, status: 201 });
