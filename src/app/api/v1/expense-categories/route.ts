import { apiHandler, readJsonObject } from "@/server/api/route";
import { createExpenseCategory, listExpenseCategories } from "@/server/services/catalog-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listExpenseCategories(context));

export const POST = apiHandler(async ({ request, context }) =>
  createExpenseCategory(context, (await readJsonObject(request)).name), { status: 201, revalidate: true });
