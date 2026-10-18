import { resetMemberPasswordDirectAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

/** Owner-only: sets a team member's password (staff user id `usr_…`) and signs them out everywhere. Body: `{ newPassword }`. */
export async function POST(request: Request, route: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await route.params;
    const body = await readJsonObject(request);
    return organizationResponse(await resetMemberPasswordDirectAction({ memberUserId: userId, newPassword: String(body.newPassword ?? "") }));
  } catch (error) { return apiFailure(error); }
}
