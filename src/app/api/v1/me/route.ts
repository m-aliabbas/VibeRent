import { updateMyProfileAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

/** Body: `{ "name": "...", "phone": "..." }`. */
export async function PATCH(request: Request) {
  try {
    const body = await readJsonObject(request);
    return organizationResponse(await updateMyProfileAction({ name: String(body.name ?? ""), phone: String(body.phone ?? "") }), { revalidate: true });
  } catch (error) { return apiFailure(error); }
}
