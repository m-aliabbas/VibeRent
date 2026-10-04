import { apiFailure } from "@/server/api/response";
import { requireBackupAdministrator } from "@/server/desktop/backup-api";
import { resolveLocalBackup } from "@/server/desktop/backup-service";
import { DomainError } from "@/server/domain/errors";

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  let requestId: string | undefined;
  try {
    const auth = await requireBackupAdministrator(request);
    requestId = auth.requestId;
    const { filename } = await context.params;
    const backupPath = await resolveLocalBackup(filename);
    if (!backupPath) throw new DomainError("NOT_FOUND", "Backup not found.", 404);
    const stream = Readable.toWeb(createReadStream(backupPath)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${filename.replaceAll('"', '')}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
