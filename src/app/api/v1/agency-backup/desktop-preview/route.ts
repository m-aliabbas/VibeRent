import { apiFailure, apiSuccess } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { previewDesktopMigration } from "@/server/services/desktop-migration-preview";

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request);
    requestId = context.requestId;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("VALIDATION_FAILED", "Attach a Windows VibeRent backup archive.", 400);
    return apiSuccess(await previewDesktopMigration(context, file), requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
