import { apiHandler } from "@/server/api/route";
import { defaultGuarantorForCustomer } from "@/server/services/guarantor-service";

export const runtime = "nodejs";

/** The customer's usual guarantor: from their last booking, otherwise the last one linked to them. `null` when none. */
export const GET = apiHandler<{ id: string }>(({ context, params }) => defaultGuarantorForCustomer(context, params.id));
