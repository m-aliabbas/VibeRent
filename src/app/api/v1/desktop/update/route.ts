import { apiFailure, apiSuccess } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import { checkForSoftwareUpdate } from "@/server/desktop/update-service";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request);
    requestId = context.requestId;
    return apiSuccess(await checkForSoftwareUpdate(), requestId, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
