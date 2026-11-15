import { getWebRequestContext } from "@/server/auth/session";
import { buildCustomerStatement } from "@/server/documents/statements";
import { DomainError, asDomainError } from "@/server/domain/errors";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const context=await getWebRequestContext(),{id}=await params,query=new URL(request.url).searchParams;
    const from=query.get("from")??"",to=query.get("to")??"",plate=query.get("plate")??"";
    if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw new DomainError("VALIDATION_FAILED","Choose a valid date range.",400);
    const statement=await buildCustomerStatement(context,id,{from,to,plate});
    const bytes=statement.bytes;
    return new Response(new Uint8Array(bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="viberent-customer-ledger-${id}.pdf"`,"cache-control":"private, no-store"}});
  }catch(error){const issue=asDomainError(error);return Response.json({error:{code:issue.code,message:issue.message}},{status:issue.status})}
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value}
