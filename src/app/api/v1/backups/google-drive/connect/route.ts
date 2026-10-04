import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator } from "@/server/desktop/backup-api";
import { createGoogleDriveAuthorization } from "@/server/desktop/google-drive-service";

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    return apiSuccess({ authorizationUrl: await createGoogleDriveAuthorization() }, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
