import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure } from "@/server/api/response";
import { readPrivateFile } from "@/server/services/private-file-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try {
    const auth = await getApiRequestContext(request); requestId = auth.requestId;
    const { id } = await context.params;
    const { file, bytes } = await readPrivateFile(auth, id);
    const disposition = file.classification === "vehicle_photo" ? "inline" : "attachment";
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
