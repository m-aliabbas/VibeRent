import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { createCustomer, listCustomers } from "@/server/services/customer-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listCustomers(context));

export const POST = apiHandler(async ({ request, context }) =>
  createCustomer(context, await parseJsonRequest(request)), { status: 201, revalidate: true });
