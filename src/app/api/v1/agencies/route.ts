import { createAgencyAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

/**
 * Creates an agency for a signed-in user who has none yet (onboarding) and makes it active.
 * Body: `{ name, slug, city, branchName, address }`.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const text = (key: string) => String(body[key] ?? "");
    return organizationResponse(await createAgencyAction({ name: text("name"), slug: text("slug"), city: text("city"), branchName: text("branchName"), address: text("address") }), { status: 201, revalidate: true });
  } catch (error) { return apiFailure(error); }
}
