import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { createAgencyPortableBackup, restoreAgencyPortableBackup } from "@/server/services/agency-portable-backup-service";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request);
    requestId = context.requestId;
    const backup = await createAgencyPortableBackup(context);
    return new Response(new Uint8Array(backup.bytes), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="${backup.fileName}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request);
    requestId = context.requestId;
    const formData = await request.formData();
    const file = formData.get("file");
    const confirmationAgencyId = formData.get("confirmationAgencyId");
    if (!(file instanceof File) || typeof confirmationAgencyId !== "string") {
      return Response.json({ error: { code: "VALIDATION_FAILED", message: "Attach a SQLite backup and confirm the agency ID." } }, { status: 400 });
    }
    return apiSuccess(await restoreAgencyPortableBackup(context, file, confirmationAgencyId), requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
