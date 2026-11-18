import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { readPrivateFile, removeVehicleFile } from "@/server/services/private-file-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try {
    const auth = await getApiRequestContext(request); requestId = auth.requestId;
    const { id } = await context.params;
    const { file, bytes } = await readPrivateFile(auth, id);
    const disposition = file.classification === "vehicle_document" ? "attachment" : "inline";
    return new Response(bytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return apiFailure(error, requestId); }
}

/** Removes a vehicle photo or document. Customer and guarantor images use /api/v1/person-documents. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try {
    const auth = await getApiRequestContext(request); requestId = auth.requestId;
    const { id } = await context.params;
    return apiSuccess(await removeVehicleFile(auth, id), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}
