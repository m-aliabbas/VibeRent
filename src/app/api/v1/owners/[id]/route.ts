import { apiHandler, readJsonObject } from "@/server/api/route";
import { archiveOwner, getOwner, saveOwner } from "@/server/services/owner-service";

export const runtime = "nodejs";

type OwnerInput = Parameters<typeof saveOwner>[1];

/** Owner with vehicles, agreements, statements and payout history. */
export const GET = apiHandler<{ id: string }>(({ context, params }) => getOwner(context, params.id));

export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = await getOwner(context, params.id);
  const changes = await readJsonObject(request);
  return saveOwner(context, { name: current.name, phone: current.phone, email: current.email, ...changes, id: params.id } as OwnerInput);
}, { revalidate: true });

export const DELETE = apiHandler<{ id: string }>(({ context, params }) => archiveOwner(context, params.id), { revalidate: true });
