import { apiHandler, findOr404, readJsonObject } from "@/server/api/route";
import { archiveDriver, listDrivers, saveDriver } from "@/server/services/driver-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(async ({ context, params }) => findOr404(await listDrivers(context), params.id, "Driver"));

/** Partial update: changed fields are merged onto the current record before validation. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = findOr404(await listDrivers(context), params.id, "Driver");
  return saveDriver(context, { ...current, ...(await readJsonObject(request)), id: params.id });
}, { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(({ context, params }) => archiveDriver(context, params.id), { revalidate: true });
