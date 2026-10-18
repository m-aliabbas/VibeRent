import { addTeamMemberDirectAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";
import type { StaffRole } from "@/server/context/request-context";

export const runtime = "nodejs";

/** Owner-only: adds a team member directly. Body: `{ name, email, password?, role, branchIds: [] }`. */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    return organizationResponse(await addTeamMemberDirectAction({
      name: String(body.name ?? ""), email: String(body.email ?? ""), password: typeof body.password === "string" ? body.password : undefined,
      role: body.role as StaffRole, branchIds: Array.isArray(body.branchIds) ? body.branchIds.map(String) : [],
    }), { status: 201, revalidate: true });
  } catch (error) { return apiFailure(error); }
}
