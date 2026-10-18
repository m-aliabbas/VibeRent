import { apiHandler, readJsonObject } from "@/server/api/route";
import { listExternalVehicles, saveExternalVehicle } from "@/server/services/external-vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listExternalVehicles(context));

export const POST = apiHandler(async ({ request, context }) => {
  const input = await readJsonObject(request);
  delete input.id;
  return saveExternalVehicle(context, input);
}, { status: 201, revalidate: true });
