import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { DomainError } from "@/server/domain/errors";
import { brandingKinds, getBranding, removeBrandingImage, uploadBrandingImage, type BrandingKind } from "@/server/services/branding-service";

export const runtime = "nodejs";

const isKind = (value: unknown): value is BrandingKind => brandingKinds.includes(value as BrandingKind);

/** Agency signature, business stamp and the signed-in account's own signature. */
export async function GET(request: Request) {
  let requestId: string | undefined;
  try { const context = await getApiRequestContext(request); requestId = context.requestId; return apiSuccess(await getBranding(context), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}

/** Multipart: `kind` (agency_signature | agency_stamp | user_signature) and `file` (PNG or JPG). Replaces that image. */
export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const form = await request.formData();
    const kind = form.get("kind"), file = form.get("file");
    if (!isKind(kind) || !(file instanceof File)) throw new DomainError("VALIDATION_FAILED", "Choose what to upload and an image.", 400);
    return apiSuccess(await uploadBrandingImage(context, kind, file), requestId, { status: 201 });
  } catch (error) { return apiFailure(error, requestId); }
}

/** `?kind=…` removes that image. */
export async function DELETE(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const kind = new URL(request.url).searchParams.get("kind");
    if (!isKind(kind)) throw new DomainError("VALIDATION_FAILED", "Choose what to remove.", 400);
    return apiSuccess(await removeBrandingImage(context, kind), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}
