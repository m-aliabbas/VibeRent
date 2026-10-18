import { apiHandler } from "@/server/api/route";
import { createCustomerCnicDraft } from "@/server/services/customer-cnic-service";

export const runtime = "nodejs";

/** Starts a CNIC upload draft for a customer that has not been created yet; pass its id as `cnicDocumentDraftId` on POST /customers. */
export const POST = apiHandler(async ({ context }) => createCustomerCnicDraft(context), { status: 201 });
