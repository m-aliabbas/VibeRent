import { apiHandler, readMultipart, requireFile } from "@/server/api/route";
import { getBookingSelfie, uploadBookingSelfie } from "@/server/services/booking-cnic-service";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

function purposeOf(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "customer") return "customer" as const;
  if (value === "guarantor") return "guarantor" as const;
  throw new DomainError("VALIDATION_FAILED", "purpose must be customer or guarantor.", 400, { purpose: "Use customer or guarantor." });
}

/** The renter's or guarantor's selfie on a booking draft: `?purpose=customer|guarantor`. */
export const GET = apiHandler<{ draftId: string }>(({ request, context, params }) =>
  getBookingSelfie(context, params.draftId, purposeOf(new URL(request.url).searchParams.get("purpose"))));

/** Multipart `image` and optional `purpose`. Replaces the earlier selfie; it moves to the person when the booking is confirmed. */
export const POST = apiHandler<{ draftId: string }>(async ({ request, context, params }) => {
  const form = await readMultipart(request);
  const image = requireFile(form, "image", "Attach the selfie.");
  return uploadBookingSelfie(context, params.draftId, image, purposeOf(form.get("purpose")));
}, { status: 201 });
