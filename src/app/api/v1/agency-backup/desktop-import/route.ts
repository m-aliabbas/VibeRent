import { apiFailure, apiSuccess } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { importDesktopAgency } from "@/server/services/desktop-migration-import";

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request);
    requestId = context.requestId;
    const form = await request.formData();
    const file = form.get("file");
    const sourceAgencyId = form.get("sourceAgencyId");
    const confirmationAgencyId = form.get("confirmationAgencyId");
    if (!(file instanceof File) || typeof sourceAgencyId !== "string" || typeof confirmationAgencyId !== "string") {
      throw new DomainError("VALIDATION_FAILED", "Attach the Windows archive, select a source agency, and confirm the web agency ID.", 400);
    }
    return apiSuccess(await importDesktopAgency(context, file, sourceAgencyId, confirmationAgencyId), requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
