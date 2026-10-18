import { apiHandler, readJsonObject } from "@/server/api/route";
import { archiveCustomer, getCustomer, getCustomerDetail, updateCustomer } from "@/server/services/customer-service";

export const runtime = "nodejs";

/** Customer detail, including booking history and lifetime value. */
export const GET = apiHandler<{ id: string }>(({ context, params }) => getCustomerDetail(context, params.id));

/** Partial update: changed fields are merged onto the current customer before validation. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = await getCustomer(context, params.id);
  const changes = await readJsonObject(request);
  return updateCustomer(context, params.id, { ...current, ...changes });
}, { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(({ context, params }) => archiveCustomer(context, params.id), { revalidate: true });
