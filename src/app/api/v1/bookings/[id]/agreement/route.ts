import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createRentalAgreementPdf } from "@/server/documents/rental-agreement";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    const agreement=await createRentalAgreementPdf(await getWebRequestContext(),id);
    return new Response(new Uint8Array(agreement.bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${agreement.fileName}"`,"cache-control":"private, no-store"}});
  } catch(error) {
    const issue=asDomainError(error);
    return Response.json({error:{code:issue.code,message:issue.message}},{status:issue.status});
  }
}
