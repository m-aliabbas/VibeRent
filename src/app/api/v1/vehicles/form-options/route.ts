import { apiHandler } from "@/server/api/route";
import { getVehicleFormOptions } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => getVehicleFormOptions(context));
