import { apiHandler, readJsonObject } from "@/server/api/route";
import { getOilChangeOverview, recordOilChange } from "@/server/services/oil-change-service";

export const runtime = "nodejs";

/** Oil-change state, interval and history for one vehicle. */
export const GET = apiHandler<{ id: string }>(({ context, params }) => getOilChangeOverview(context, params.id));

/** Body: `{ servicedOn, odometer, cost, workshop, notes?, addExpense? }`. Returns the refreshed overview. */
export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  recordOilChange(context, params.id, await readJsonObject(request)), { status: 201, revalidate: true });
