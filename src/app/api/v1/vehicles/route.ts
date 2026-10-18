import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { listVehicles, saveVehicle } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listVehicles(context));

export const POST = apiHandler(async ({ request, context }) =>
  saveVehicle(context, await parseJsonRequest(request)), { status: 201, revalidate: true });
