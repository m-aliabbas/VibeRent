import { toggleBranchActiveAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

/** Owner-only. Body: `{ active: boolean }`. */
export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await route.params;
    const body = await readJsonObject(request);
    if (typeof body.active !== "boolean") throw new DomainError("VALIDATION_FAILED", "active must be true or false.", 400, { active: "Send true or false." });
    return organizationResponse(await toggleBranchActiveAction({ branchId: id, active: body.active }), { revalidate: true });
  } catch (error) { return apiFailure(error); }
}
