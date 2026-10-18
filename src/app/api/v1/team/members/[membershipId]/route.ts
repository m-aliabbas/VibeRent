import { updateMemberAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";
import type { StaffRole } from "@/server/context/request-context";

export const runtime = "nodejs";

/** Owner-only. Body: `{ role, active, branchIds: [] }`. */
export async function PATCH(request: Request, route: { params: Promise<{ membershipId: string }> }) {
  try {
    const { membershipId } = await route.params;
    const body = await readJsonObject(request);
    return organizationResponse(await updateMemberAction({ membershipId, role: body.role as StaffRole, active: body.active !== false, branchIds: Array.isArray(body.branchIds) ? body.branchIds.map(String) : [] }), { revalidate: true });
  } catch (error) { return apiFailure(error); }
}
