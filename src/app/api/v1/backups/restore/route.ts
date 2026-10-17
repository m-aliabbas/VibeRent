import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { requireBackupAdministrator, recordBackupAudit } from "@/server/desktop/backup-api";
import { stageRestore } from "@/server/desktop/backup-service";
import { DomainError } from "@/server/domain/errors";

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export async function POST(request: Request) {
  let requestId: string | undefined;
  let temporaryPath: string | undefined;
  try {
    const context = await requireBackupAdministrator(request);
    requestId = context.requestId;
    const form = await request.formData();
    const file = form.get("file");
    const confirmation = form.get("confirmation");
    if (!(file instanceof File) || !file.name.endsWith(".viberent-backup.tgz")) {
      throw new DomainError("VALIDATION_FAILED", "Select a VibeRent backup archive.", 400);
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      throw new DomainError("VALIDATION_FAILED", "The backup file has an invalid size.", 413);
    }
    if (confirmation !== "RESTORE") {
      throw new DomainError("VALIDATION_FAILED", "Restore confirmation is required.", 400);
    }
    const temporaryDirectory = path.join(os.tmpdir(), "viberent-uploads");
    await mkdir(temporaryDirectory, { recursive: true });
    temporaryPath = path.join(temporaryDirectory, `${crypto.randomUUID()}.viberent-backup.tgz`);
    await writeFile(temporaryPath, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    const result = await stageRestore(temporaryPath, file.name, context);
    await recordBackupAudit(context, "backup.restore_staged", { sourceFilename: file.name, safetyBackup: result.safetyBackup });
    return apiSuccess(result, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  } finally {
    if (temporaryPath) await rm(temporaryPath, { force: true });
  }
}
