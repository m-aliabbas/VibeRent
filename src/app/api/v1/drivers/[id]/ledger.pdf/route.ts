import { getWebRequestContext } from "@/server/auth/session";
import { getDriverLedger } from "@/server/services/driver-service";
import { getReportAgencyHeader } from "@/server/services/organization-settings-service";
import { createAccountLedgerPdf, number, sheetDate } from "@/server/documents/account-ledger";
import { DomainError, asDomainError } from "@/server/domain/errors";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const context=await getWebRequestContext(),{id}=await params,query=new URL(request.url).searchParams;
    const from=query.get("from")||"0001-01-01",to=query.get("to")||"9999-12-31";
    if(!validDate(from)||!validDate(to)||from>to)throw new DomainError("VALIDATION_FAILED","Choose a valid date range.",400);
    const [{driver,bookings,expenses,summary},agency]=await Promise.all([getDriverLedger(context,id,from,to),getReportAgencyHeader(context)]);
    const bytes=await createAccountLedgerPdf({
      ...agency,
      title:`Driver ledger - ${driver.name}`,
      period:`${query.get("from")?sheetDate(from):"All dates"} to ${query.get("to")?sheetDate(to):"present"} | ${summary.trips} trips, ${summary.days} days`,
      columns:[{label:"Date",width:58},{label:"Car",width:62},{label:"Customer",width:105},{label:"Description",width:126},{label:"Rent",width:80,align:"right"},{label:"Received",width:80,align:"right"}],
      rows:bookings.map(row=>[sheetDate(row.pickupAt),row.plate,row.customer,`${row.destination||"Local"} (${row.id})`,number(row.totalAmount),number(row.paid)]),
      totals:bookings.length?["Total","","","",number(summary.rent),number(summary.received)]:undefined,
      summary,expenses,emptyText:"No rentals in this period.",
    });
    return new Response(new Uint8Array(bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="viberent-driver-ledger-${id}.pdf"`,"cache-control":"private, no-store"}});
  }catch(error){const issue=asDomainError(error);return Response.json({error:{code:issue.code,message:issue.message}},{status:issue.status})}
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value}
