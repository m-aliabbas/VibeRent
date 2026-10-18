import { apiHandler, readJsonObject } from "@/server/api/route";
import { transitionVehicleStatus } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

type StatusInput = Parameters<typeof transitionVehicleStatus>[2];

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  transitionVehicleStatus(context, params.id, await readJsonObject(request) as StatusInput), { revalidate: true });
