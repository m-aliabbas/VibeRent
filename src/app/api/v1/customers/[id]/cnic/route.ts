import { apiHandler, readMultipart, requireFile } from "@/server/api/route";
import { getCustomerCnicIntake, uploadCustomerCnic } from "@/server/services/customer-cnic-service";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(({ context, params }) => getCustomerCnicIntake(context, { type: "customer", id: params.id }));

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const form = await readMultipart(request);
  const side = form.get("side");
  if (side !== "front" && side !== "back") throw new DomainError("VALIDATION_FAILED", "side must be front or back.", 400, { side: "Use front or back." });
  return uploadCustomerCnic(context, { type: "customer", id: params.id }, side, requireFile(form, "image", "Attach the CNIC image."));
}, { status: 201, revalidate: true });
