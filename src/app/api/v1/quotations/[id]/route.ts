import { apiHandler, readJsonObject } from "@/server/api/route";
import { archiveQuotation, getQuotation, saveQuotation, setQuotationStatus } from "@/server/services/quotation-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(({ context, params }) => getQuotation(context, params.id));

/** `{ status }` changes only the status (draft, sent, accepted, declined); other fields update the quote. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const body = await readJsonObject(request);
  if (typeof body.status === "string" && Object.keys(body).length === 1) return setQuotationStatus(context, params.id, body.status);
  const current = await getQuotation(context, params.id);
  return saveQuotation(context, { ...current, ...body, id: params.id });
}, { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(({ context, params }) => archiveQuotation(context, params.id), { revalidate: true });
