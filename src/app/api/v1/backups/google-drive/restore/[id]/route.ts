import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator, recordBackupAudit } from "@/server/desktop/backup-api";
import { stageRestore } from "@/server/desktop/backup-service";
import { downloadGoogleDriveBackup } from "@/server/desktop/google-drive-service";
import { parseJsonRequest } from "@/server/api/response";
import { DomainError } from "@/server/domain/errors";

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  let temporaryPath: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    const body = await parseJsonRequest(request) as { confirmation?: unknown };
    if (body.confirmation !== "RESTORE") throw new DomainError("VALIDATION_FAILED", "Restore confirmation is required.", 400);
    const { id } = await route.params;
    const temporaryDirectory = path.join(os.tmpdir(), "viberent-drive-restore");
    await mkdir(temporaryDirectory, { recursive: true });
    temporaryPath = path.join(temporaryDirectory, `${crypto.randomUUID()}.viberent-backup.tgz`);
    const downloaded = await downloadGoogleDriveBackup(id, temporaryPath);
    const result = await stageRestore(temporaryPath, downloaded.filename, context);
    recordBackupAudit(context, "backup.restore_staged", { source: "google_drive", sourceFilename: downloaded.filename, safetyBackup: result.safetyBackup });
    return apiSuccess(result, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  } finally {
    if (temporaryPath) await rm(temporaryPath, { force: true });
  }
}
