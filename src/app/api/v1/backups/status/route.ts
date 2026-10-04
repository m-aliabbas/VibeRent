import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator } from "@/server/desktop/backup-api";
import { getBackupSchedulerStatus } from "@/server/desktop/backup-scheduler";
import { getBackupOverview } from "@/server/desktop/backup-service";
import { getGoogleDriveStatus } from "@/server/desktop/google-drive-service";
import { getDesktopLicenseStatus } from "@/server/desktop/license-service";
import { isDesktopRuntime } from "@/server/desktop/runtime-paths";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    return apiSuccess({
      desktop: isDesktopRuntime(),
      license: getDesktopLicenseStatus(),
      backup: await getBackupOverview(),
      scheduler: getBackupSchedulerStatus(),
      googleDrive: await getGoogleDriveStatus(),
    }, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
