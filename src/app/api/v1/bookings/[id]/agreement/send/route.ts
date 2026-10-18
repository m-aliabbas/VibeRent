import { apiHandler } from "@/server/api/route";
import { deliverRentalAgreement } from "@/server/services/agreement-delivery-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(({ context, params }) => deliverRentalAgreement(context, params.id));
