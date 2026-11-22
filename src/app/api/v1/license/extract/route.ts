import { apiHandler, readMultipart } from "@/server/api/route";
import { requireRole } from "@/server/auth/authorize";
import { MAX_CNIC_IMAGE_BYTES } from "@/server/cnic-ocr/cnic-ocr-service";
import { extractLicenseFromUploads } from "@/server/cnic-ocr/license-ocr";
import { SUPPORTED_CNIC_IMAGE_MIME_TYPES, type CnicImageMimeType } from "@/server/cnic-ocr/types";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

async function image(form: FormData, field: string) {
  const value = form.get(field);
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (!(SUPPORTED_CNIC_IMAGE_MIME_TYPES as readonly string[]).includes(value.type)) throw new DomainError("VALIDATION_FAILED", "Use a JPEG, PNG, WEBP, or non-animated GIF image.", 400, { [field]: "Unsupported image type." });
  if (value.size > MAX_CNIC_IMAGE_BYTES) throw new DomainError("VALIDATION_FAILED", "The image must be 10 MiB or smaller.", 400, { [field]: "Choose a smaller image." });
  return { bytes: new Uint8Array(await value.arrayBuffer()), mimeType: value.type as CnicImageMimeType };
}

/**
 * Reads a Pakistani driving licence (multipart `frontImage`, optional `backImage`): licence number, expiry,
 * name, father name, CNIC, date of birth, address. Nothing is stored. Dates come back as DD.MM.YYYY.
 */
export const POST = apiHandler(async ({ request, context }) => {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const form = await readMultipart(request);
  const front = await image(form, "frontImage"), back = await image(form, "backImage");
  if (!front && !back) throw new DomainError("VALIDATION_FAILED", "Choose the licence front image to read.", 400, { frontImage: "Attach the licence image." });
  const extraction = await extractLicenseFromUploads(front, back);
  if (extraction.status === "not_configured") throw new DomainError("INTERNAL_ERROR", "Licence reading is not set up on this server.", 503);
  if (extraction.status !== "complete" || !extraction.result) throw new DomainError("INTERNAL_ERROR", "The licence could not be read. Enter the details by hand.", 502);
  return extraction.result;
});
