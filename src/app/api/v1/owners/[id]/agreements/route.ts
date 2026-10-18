import { apiHandler, readJsonObject } from "@/server/api/route";
import { createAgreement } from "@/server/services/owner-service";

export const runtime = "nodejs";

type AgreementInput = Parameters<typeof createAgreement>[2];

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  createAgreement(context, params.id, await readJsonObject(request) as AgreementInput), { status: 201, revalidate: true });
