import { createBranchAction, listBranchesAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

export async function GET() {
  return organizationResponse(await listBranchesAction());
}

/** Owner-only. Body: `{ name, city, address }`. */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    return organizationResponse(await createBranchAction({ name: String(body.name ?? ""), city: String(body.city ?? ""), address: String(body.address ?? "") }), { status: 201, revalidate: true });
  } catch (error) { return apiFailure(error); }
}
