import { apiHandler, readJsonObject } from "@/server/api/route";
import { listGuarantors, saveGuarantor } from "@/server/services/guarantor-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listGuarantors(context));

export const POST = apiHandler(async ({ request, context }) => {
  const input = await readJsonObject(request);
  delete input.id;
  return saveGuarantor(context, input);
}, { status: 201, revalidate: true });
