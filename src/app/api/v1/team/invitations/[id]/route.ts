import { cancelInvitationAction } from "@/app/actions/organization";
import { organizationResponse } from "@/server/api/route";

export const runtime = "nodejs";

export async function DELETE(_request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  return organizationResponse(await cancelInvitationAction(id), { revalidate: true });
}
