import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { DomainError } from "@/server/domain/errors";
import { isPersonDocumentOwner, isPersonDocumentSlot, listPersonDocuments, removePersonDocument, uploadPersonDocument } from "@/server/services/person-document-service";

export const runtime = "nodejs";

/** CNIC and driving-license images of a customer or guarantor: `?owner=customer|guarantor&id=…`. */
export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner"), id = url.searchParams.get("id");
    if (!isPersonDocumentOwner(owner) || !id) throw new DomainError("VALIDATION_FAILED", "owner and id are required.", 400);
    return apiSuccess(await listPersonDocuments(context, owner, id), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}

/** Multipart upload: owner, id, slot (cnic_front, cnic_back, license_front, license_back), file. Replaces that slot. */
export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) throw new DomainError("VALIDATION_FAILED", "Content-Type must be multipart/form-data.", 415);
    const form = await request.formData();
    const owner = form.get("owner"), id = form.get("id"), slot = form.get("slot"), file = form.get("file");
    if (!isPersonDocumentOwner(owner) || typeof id !== "string" || !isPersonDocumentSlot(slot) || !(file instanceof File)) throw new DomainError("VALIDATION_FAILED", "Owner, id, document side, and file are required.", 400);
    return apiSuccess(await uploadPersonDocument(context, owner, id, slot, file), requestId, { status: 201 });
  } catch (error) { return apiFailure(error, requestId); }
}

/** `?owner=…&id=…&fileId=…` removes one image. */
export async function DELETE(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner"), id = url.searchParams.get("id"), fileId = url.searchParams.get("fileId");
    if (!isPersonDocumentOwner(owner) || !id || !fileId) throw new DomainError("VALIDATION_FAILED", "owner, id and fileId are required.", 400);
    return apiSuccess(await removePersonDocument(context, owner, id, fileId), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}
