import { apiHandler, readJsonObject, readOptionalJsonObject } from "@/server/api/route";
import { amendBooking, archiveBooking, getBooking } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(({ context, params }) => getBooking(context, params.id));

export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  amendBooking(context, params.id, await readJsonObject(request)), { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const body = await readOptionalJsonObject(request);
  const reason = body.reason ?? new URL(request.url).searchParams.get("reason") ?? undefined;
  return archiveBooking(context, params.id, reason);
}, { revalidate: true });
