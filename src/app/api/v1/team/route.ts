import { listTeamAction } from "@/app/actions/organization";
import { organizationResponse } from "@/server/api/route";

export const runtime = "nodejs";

/** Owner-only: members, pending invitations and branches. */
export async function GET() {
  return organizationResponse(await listTeamAction());
}
