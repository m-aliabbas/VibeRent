import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator, recordBackupAudit } from "@/server/desktop/backup-api";
import { createBackup } from "@/server/desktop/backup-service";
import { getGoogleDriveStatus, uploadBackupToGoogleDrive } from "@/server/desktop/google-drive-service";

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    const backup = await createBackup("manual");
    const driveStatus = await getGoogleDriveStatus();
    let driveUpload = null;
    let driveError = null;
    if (driveStatus.connected) {
      try { driveUpload = await uploadBackupToGoogleDrive(backup.path); }
      catch (error) { driveError = error instanceof Error ? error.message : "Drive upload failed."; }
    }
    await recordBackupAudit(context, "backup.created", {
      filename: backup.filename,
      size: backup.size,
      driveUploaded: Boolean(driveUpload),
    });
    return apiSuccess({
      backup: { filename: backup.filename, size: backup.size, createdAt: backup.createdAt },
      driveUpload,
      driveError,
    }, requestId, { status: 201 });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
