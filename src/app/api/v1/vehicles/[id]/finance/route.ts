import { apiHandler } from "@/server/api/route";
import { getVehicleFinance } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(({ context, params }) => getVehicleFinance(context, params.id));
