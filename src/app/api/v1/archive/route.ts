import { apiHandler } from "@/server/api/route";
import { listArchive } from "@/server/services/archive-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listArchive(context));
