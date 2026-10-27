import { apiHandler, readJsonObject } from "@/server/api/route";
import { voidOilChange } from "@/server/services/oil-change-service";

export const runtime = "nodejs";

/** Owner, fleet. Body: `{ reason }`. Removes a mistaken record from the history. */
export const POST = apiHandler<{ id: string; recordId: string }>(async ({ request, context, params }) =>
  voidOilChange(context, params.id, params.recordId, (await readJsonObject(request)).reason), { revalidate: true });
