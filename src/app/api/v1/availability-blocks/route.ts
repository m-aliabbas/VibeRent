import { apiHandler, readJsonObject } from "@/server/api/route";
import { createAvailabilityBlock, listAvailabilityBlocks } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listAvailabilityBlocks(context));

export const POST = apiHandler(async ({ request, context }) =>
  createAvailabilityBlock(context, await readJsonObject(request)), { status: 201, revalidate: true });
