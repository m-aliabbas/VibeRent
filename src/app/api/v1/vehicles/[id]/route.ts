import { apiHandler, readJsonObject } from "@/server/api/route";
import { getVehicle, saveVehicle, setVehicleArchived } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(({ context, params }) => getVehicle(context, params.id));

/** Partial update: changed fields are merged onto the current vehicle, then the whole record is revalidated. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = await getVehicle(context, params.id);
  const changes = await readJsonObject(request);
  return saveVehicle(context, { ...current, ...changes, id: params.id });
}, { revalidate: true });

/** Archives the vehicle (same as POST /vehicles/:id/archive). */
export const DELETE = apiHandler<{ id: string }>(({ context, params }) => setVehicleArchived(context, params.id, true), { revalidate: true });
