import { apiHandler, readJsonObject } from "@/server/api/route";
import { setOilChangeInterval } from "@/server/services/oil-change-service";

export const runtime = "nodejs";

/** Owner, fleet. Body: `{ intervalKm }`. */
export const PUT = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  setOilChangeInterval(context, params.id, (await readJsonObject(request)).intervalKm), { revalidate: true });
