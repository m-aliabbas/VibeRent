import { apiHandler } from "@/server/api/route";
import { getReports } from "@/server/services/report-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => getReports(context));
