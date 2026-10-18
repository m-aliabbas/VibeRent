import { inviteTeamMemberAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";
import type { StaffRole } from "@/server/context/request-context";

export const runtime = "nodejs";

/** Body: `{ email, role, branchIds: [] }`. Sends an invitation email. */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    return organizationResponse(await inviteTeamMemberAction({ email: String(body.email ?? ""), role: body.role as StaffRole, branchIds: Array.isArray(body.branchIds) ? body.branchIds.map(String) : [] }), { status: 201, revalidate: true });
  } catch (error) { return apiFailure(error); }
}
