import { apiHandler } from "@/server/api/route";
import { setVehicleArchived } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(({ context, params }) => setVehicleArchived(context, params.id, false), { revalidate: true });
