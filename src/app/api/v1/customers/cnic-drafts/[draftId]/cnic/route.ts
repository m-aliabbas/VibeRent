import { apiHandler, readMultipart, requireFile } from "@/server/api/route";
import { getCustomerCnicIntake, uploadCustomerCnic } from "@/server/services/customer-cnic-service";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

export const GET = apiHandler<{ draftId: string }>(({ context, params }) => getCustomerCnicIntake(context, { type: "draft", id: params.draftId }));

export const POST = apiHandler<{ draftId: string }>(async ({ request, context, params }) => {
  const form = await readMultipart(request);
  const side = form.get("side");
  if (side !== "front" && side !== "back") throw new DomainError("VALIDATION_FAILED", "side must be front or back.", 400, { side: "Use front or back." });
  return uploadCustomerCnic(context, { type: "draft", id: params.draftId }, side, requireFile(form, "image", "Attach the CNIC image."));
}, { status: 201 });
