import { getWebRequestContext } from "@/server/auth/session";
import { getCustomerDetail } from "@/server/services/customer-service";
import { getReportAgencyHeader } from "@/server/services/organization-settings-service";
import { createAccountLedgerPdf, number, sheetDate } from "@/server/documents/account-ledger";
import { customerLedger } from "@/lib/reports/customer-ledger";
import { filterAccountExpenses, summarizeAccount } from "@/lib/reports/account-summary";
import { DomainError, asDomainError } from "@/server/domain/errors";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const context=await getWebRequestContext(),{id}=await params,query=new URL(request.url).searchParams;
    const from=query.get("from")??"",to=query.get("to")??"",plate=query.get("plate")??"";
    if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw new DomainError("VALIDATION_FAILED","Choose a valid date range.",400);
    const [customer,agency]=await Promise.all([getCustomerDetail(context,id),getReportAgencyHeader(context)]);
    if(plate&&!customer.bookings.some(row=>row.plate===plate)&&!customer.expenses.some(row=>row.plate===plate))throw new DomainError("VALIDATION_FAILED","Unknown car filter.",400);
    const ledger=customerLedger(customer.bookings,{from,to,plate},customer.expenses);
    const expenses=filterAccountExpenses(customer.expenses,{from,to,plate});
    const balance=(value:number)=>value<0?`${number(value)} Cr`:number(value);
    const bytes=await createAccountLedgerPdf({
      ...agency,
      title:`Customer ledger - ${customer.name}`,
      period:`${from?sheetDate(from):"All dates"} to ${to?sheetDate(to):"present"}${plate?` | ${plate}`:""}`,
      columns:[{label:"Date",width:58},{label:"Car",width:62},{label:"Booking / expense",width:131},{label:"Amount",width:80,align:"right"},{label:"Paid",width:80,align:"right"},{label:"Remaining",width:100,align:"right"}],
      opening:ledger.opening?["","","Opening balance","","",balance(ledger.opening)]:undefined,
      rows:ledger.rows.map(row=>[sheetDate(row.pickupAt),row.plate,row.kind==="expense"?`Expense ${row.id} - ${row.description}`:`${row.id} (${row.status.replaceAll("_"," ")})`,number(row.amount),number(row.paid),balance(row.balance)]),
      totals:ledger.rows.length?["Total","","",number(ledger.amount),number(ledger.paid),balance(ledger.closing)]:undefined,
      tableTitle:"Rentals and charges",summary:summarizeAccount(ledger.rows.filter(row=>row.kind==="booking"),expenses),expenses,emptyText:"No rentals match this period.",
    });
    return new Response(new Uint8Array(bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="viberent-customer-ledger-${id}.pdf"`,"cache-control":"private, no-store"}});
  }catch(error){const issue=asDomainError(error);return Response.json({error:{code:issue.code,message:issue.message}},{status:issue.status})}
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value}
