import { updateOrganizationProfileAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

type ProfileInput = Parameters<typeof updateOrganizationProfileAction>[0];

export async function PUT(request: Request) {
  try { return organizationResponse(await updateOrganizationProfileAction(await readJsonObject(request) as ProfileInput), { revalidate: true }); }
  catch (error) { return apiFailure(error); }
}
