import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator, recordBackupAudit } from "@/server/desktop/backup-api";
import { createBackup } from "@/server/desktop/backup-service";
import { uploadBackupToGoogleDrive } from "@/server/desktop/google-drive-service";

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    const backup = await createBackup("manual");
    const uploaded = await uploadBackupToGoogleDrive(backup.path);
    recordBackupAudit(context, "backup.google_drive_uploaded", { filename: backup.filename, fileId: uploaded.fileId });
    return apiSuccess({ backup: { filename: backup.filename, size: backup.size }, uploaded }, requestId, { status: 201 });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
