import { apiHandler, readJsonObject } from "@/server/api/route";
import { createAgencyCity, listAgencyCities } from "@/server/services/catalog-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listAgencyCities(context));

export const POST = apiHandler(async ({ request, context }) =>
  createAgencyCity(context, (await readJsonObject(request)).name), { status: 201, revalidate: true });
