import { updateAgreementDesignerAction } from "@/app/actions/organization";
import { organizationResponse, readJsonObject } from "@/server/api/route";
import { apiFailure } from "@/server/api/response";

export const runtime = "nodejs";

type DesignInput = Parameters<typeof updateAgreementDesignerAction>[0];

export async function PUT(request: Request) {
  try { return organizationResponse(await updateAgreementDesignerAction(await readJsonObject(request) as DesignInput), { revalidate: true }); }
  catch (error) { return apiFailure(error); }
}
