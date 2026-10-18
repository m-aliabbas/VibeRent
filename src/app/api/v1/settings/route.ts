import { apiHandler } from "@/server/api/route";
import { getOrganizationSettings } from "@/server/services/organization-settings-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => getOrganizationSettings(context));
