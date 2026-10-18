import { apiHandler, readJsonObject } from "@/server/api/route";
import { listOwners, saveOwner } from "@/server/services/owner-service";

export const runtime = "nodejs";

type OwnerInput = Parameters<typeof saveOwner>[1];

/** Owners plus portfolio totals. */
export const GET = apiHandler(({ context }) => listOwners(context));

export const POST = apiHandler(async ({ request, context }) => {
  const input = await readJsonObject(request);
  delete input.id;
  return saveOwner(context, input as OwnerInput);
}, { status: 201, revalidate: true });
