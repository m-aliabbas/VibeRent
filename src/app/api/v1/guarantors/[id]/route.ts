import { apiHandler, findOr404, readJsonObject } from "@/server/api/route";
import { archiveGuarantor, getGuarantorDetail, listGuarantors, saveGuarantor } from "@/server/services/guarantor-service";

export const runtime = "nodejs";

/** Guarantor with the customers they back and the bookings they guaranteed. */
export const GET = apiHandler<{ id: string }>(({ context, params }) => getGuarantorDetail(context, params.id));

/** Partial update: changed fields are merged onto the current record before validation. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = findOr404(await listGuarantors(context), params.id, "Guarantor");
  return saveGuarantor(context, { ...current, ...(await readJsonObject(request)), id: params.id });
}, { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(({ context, params }) => archiveGuarantor(context, params.id), { revalidate: true });
