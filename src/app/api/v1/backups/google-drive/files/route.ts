import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator } from "@/server/desktop/backup-api";
import { listGoogleDriveBackups } from "@/server/desktop/google-drive-service";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    return apiSuccess(await listGoogleDriveBackups(), requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
