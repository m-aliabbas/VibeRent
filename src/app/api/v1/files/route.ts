import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { listVehicleFiles, uploadVehicleFile } from "@/server/services/private-file-service";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const url = new URL(request.url);
    const vehicleId = url.searchParams.get("vehicleId");
    if (!vehicleId) throw new DomainError("VALIDATION_FAILED", "vehicleId is required.", 400);
    return apiSuccess(await listVehicleFiles(context, vehicleId), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) throw new DomainError("VALIDATION_FAILED", "Content-Type must be multipart/form-data.", 415);
    const form = await request.formData();
    const vehicleId = form.get("vehicleId");
    const classification = form.get("classification");
    const file = form.get("file");
    if (typeof vehicleId !== "string" || typeof classification !== "string" || !(file instanceof File)) throw new DomainError("VALIDATION_FAILED", "Vehicle, attachment type, and file are required.", 400);
    return apiSuccess(await uploadVehicleFile(context, vehicleId, classification, file), requestId, { status: 201 });
  } catch (error) { return apiFailure(error, requestId); }
}
