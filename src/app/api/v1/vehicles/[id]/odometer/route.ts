import { apiHandler, readJsonObject } from "@/server/api/route";
import { updateVehicleOdometer } from "@/server/services/odometer-service";

export const runtime="nodejs";

/** Records a manual odometer reading for a fleet vehicle. */
export const POST=apiHandler<{id:string}>(async({request,context,params})=>updateVehicleOdometer(context,params.id,await readJsonObject(request) as Parameters<typeof updateVehicleOdometer>[2]),{status:201,revalidate:true});
