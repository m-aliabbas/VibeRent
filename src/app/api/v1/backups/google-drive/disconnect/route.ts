import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator, recordBackupAudit } from "@/server/desktop/backup-api";
import { disconnectGoogleDrive } from "@/server/desktop/google-drive-service";

export async function DELETE(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    const result = await disconnectGoogleDrive();
    recordBackupAudit(context, "backup.google_drive_disconnected", {});
    return apiSuccess(result, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
