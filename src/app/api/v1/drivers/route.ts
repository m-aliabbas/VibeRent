import { apiHandler, readJsonObject } from "@/server/api/route";
import { listDrivers, saveDriver } from "@/server/services/driver-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listDrivers(context));

export const POST = apiHandler(async ({ request, context }) => {
  const input = await readJsonObject(request);
  delete input.id;
  return saveDriver(context, input);
}, { status: 201, revalidate: true });
