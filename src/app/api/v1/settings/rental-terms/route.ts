import { updateRentalTermsAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject, requireString } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

/** Body: `{ "terms": "...", "language": "en" | "ur" }`. */
export async function PUT(request: Request) {
  try {
    const body = await readJsonObject(request);
    const language = body.language === "ur" ? "ur" : "en";
    return organizationResponse(await updateRentalTermsAction(requireString(body.terms, "terms", "Enter the rental terms."), language), { revalidate: true });
  } catch (error) { return apiFailure(error); }
}
