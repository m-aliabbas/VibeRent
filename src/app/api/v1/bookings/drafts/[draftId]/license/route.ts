import { apiHandler, readMultipart, requireFile } from "@/server/api/route";
import { getBookingLicenseIntake, uploadBookingLicense } from "@/server/services/booking-cnic-service";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

function purposeOf(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "customer") return "customer" as const;
  if (value === "guarantor") return "guarantor" as const;
  throw new DomainError("VALIDATION_FAILED", "purpose must be customer or guarantor.", 400, { purpose: "Use customer or guarantor." });
}

/** Driving licence images on a booking draft and what OCR read from them: `?purpose=customer|guarantor`. */
export const GET = apiHandler<{ draftId: string }>(({ request, context, params }) =>
  getBookingLicenseIntake(context, params.draftId, purposeOf(new URL(request.url).searchParams.get("purpose"))));

/** Multipart `side` (front|back), `image`, optional `purpose`. Answers with the licence fields read so far (`extracted`). */
export const POST = apiHandler<{ draftId: string }>(async ({ request, context, params }) => {
  const form = await readMultipart(request);
  const side = form.get("side");
  if (side !== "front" && side !== "back") throw new DomainError("VALIDATION_FAILED", "side must be front or back.", 400, { side: "Use front or back." });
  const image = requireFile(form, "image", "Attach the licence image.");
  return uploadBookingLicense(context, params.draftId, side, image, purposeOf(form.get("purpose")));
}, { status: 201 });
