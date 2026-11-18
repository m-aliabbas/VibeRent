import { apiHandler, readJsonObject } from "@/server/api/route";
import { listQuotations, saveQuotation } from "@/server/services/quotation-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listQuotations(context));

export const POST = apiHandler(async ({ request, context }) => {
  const input = await readJsonObject(request);
  delete input.id;
  return saveQuotation(context, input);
}, { status: 201, revalidate: true });
