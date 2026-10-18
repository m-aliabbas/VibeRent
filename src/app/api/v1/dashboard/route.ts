import { apiHandler } from "@/server/api/route";
import { getDashboard } from "@/server/services/dashboard-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => getDashboard(context));
