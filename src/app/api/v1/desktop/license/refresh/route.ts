import { apiFailure, apiSuccess } from "@/server/api/response";
import { refreshDesktopLicense } from "@/server/desktop/license-service";

export async function POST() {
  const requestId = `req_${crypto.randomUUID()}`;
  try {
    const status = await refreshDesktopLicense();
    if (!status.enforced || status.state === "active") {
      const { startBackupScheduler } = await import("@/server/desktop/backup-scheduler");
      startBackupScheduler();
    }
    return apiSuccess(status, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
