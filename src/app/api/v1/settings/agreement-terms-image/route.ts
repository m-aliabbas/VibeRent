import { uploadAgreementTermsImageAction } from "@/app/actions/organization";
import { organizationResponse, readMultipart } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

/** Multipart field `file` (JPG or PNG). Save the agreement design afterwards to use it. */
export async function POST(request: Request) {
  try { return organizationResponse(await uploadAgreementTermsImageAction(await readMultipart(request)), { status: 201 }); }
  catch (error) { return apiFailure(error); }
}
