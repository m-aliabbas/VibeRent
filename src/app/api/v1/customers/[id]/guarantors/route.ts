import { apiHandler, readJsonObject, requireString } from "@/server/api/route";
import { guarantorFromCustomer, linkCustomerGuarantor, listCustomerGuarantors, unlinkCustomerGuarantor } from "@/server/services/guarantor-service";

export const runtime = "nodejs";

/** Guarantors backing this customer: saved links and the guarantors used on their bookings. */
export const GET = apiHandler<{ id: string }>(({ context, params }) => listCustomerGuarantors(context, params.id));

/** Links a guarantor: `{ guarantorId }` for a saved guarantor, or `{ customerId }` to use another customer as the guarantor. */
export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const body = await readJsonObject(request);
  const guarantorId = typeof body.customerId === "string"
    ? (await guarantorFromCustomer(context, body.customerId)).id
    : requireString(body.guarantorId, "guarantorId", "Choose a guarantor.");
  return linkCustomerGuarantor(context, params.id, guarantorId);
}, { status: 201, revalidate: true });

/** Removes the saved link: `{ guarantorId }`. Bookings keep their guarantor. */
export const DELETE = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const body = await readJsonObject(request);
  return unlinkCustomerGuarantor(context, params.id, requireString(body.guarantorId, "guarantorId", "Choose a guarantor."));
}, { revalidate: true });
