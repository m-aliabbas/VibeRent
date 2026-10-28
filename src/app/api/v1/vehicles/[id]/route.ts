import { apiHandler, readJsonObject } from "@/server/api/route";
import { deleteVehicle, getVehicle, saveVehicle } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(({ context, params }) => getVehicle(context, params.id));

/** Partial update: changed fields are merged onto the current vehicle, then the whole record is revalidated. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = await getVehicle(context, params.id);
  const changes = await readJsonObject(request);
  return saveVehicle(context, { ...current, ...changes, id: params.id });
}, { revalidate: true });

/** Deletes a vehicle even when it has bookings. `?deleteHistory=true` also deletes its bookings, payments, expenses, and payouts. */
export const DELETE = apiHandler<{ id: string }>(({ request, context, params }) => deleteVehicle(context, params.id, { deleteHistory: new URL(request.url).searchParams.get("deleteHistory") === "true" }), { revalidate: true });
