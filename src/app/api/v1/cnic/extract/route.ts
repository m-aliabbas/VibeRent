import { extractCnicAction } from "@/app/actions/cnic-ocr";
import { apiHandler, readMultipart } from "@/server/api/route";
import { requireRole } from "@/server/auth/authorize";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

/** Reads name, CNIC number, dates and address from front and back CNIC photos (multipart `frontImage`, `backImage`). */
export const POST = apiHandler(async ({ request, context }) => {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const result = await extractCnicAction(await readMultipart(request));
  if (result.ok) return result.data;
  if (result.error.code === "INVALID_IMAGE") throw new DomainError("VALIDATION_FAILED", result.error.message, 400);
  if (result.error.code === "OPENAI_NOT_CONFIGURED") throw new DomainError("INTERNAL_ERROR", result.error.message, 503);
  throw new DomainError("INTERNAL_ERROR", result.error.message, 502);
});
