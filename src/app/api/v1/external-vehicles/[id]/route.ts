import { apiHandler, findOr404, readJsonObject } from "@/server/api/route";
import { archiveExternalVehicle, listExternalVehicles, saveExternalVehicle } from "@/server/services/external-vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(async ({ context, params }) => findOr404(await listExternalVehicles(context), params.id, "External vehicle"));

/** Partial update: changed fields are merged onto the current record before validation. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = findOr404(await listExternalVehicles(context), params.id, "External vehicle");
  return saveExternalVehicle(context, { ...current, ...(await readJsonObject(request)), id: params.id });
}, { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(({ context, params }) => archiveExternalVehicle(context, params.id), { revalidate: true });
