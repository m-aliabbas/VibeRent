import { buildLedgerEntries, filterLedgerEntries, ledgerOpeningResult } from "@/lib/reports/ledger";
import type { LedgerEntryType, LedgerScope } from "@/lib/reports/ledger";
import { getWebRequestContext } from "@/server/auth/session";
import { createLedgerReportPdf } from "@/server/documents/ledger-report";
import { DomainError,asDomainError } from "@/server/domain/errors";
import { getReports } from "@/server/services/report-service";

export async function GET(request:Request){
  try{
    const context=await getWebRequestContext();
    const url=new URL(request.url);
    const data=await getReports(context);
    const from=requiredDate(url.searchParams.get("from"),"from");
    const to=requiredDate(url.searchParams.get("to"),"to");
    if(from>to)throw new DomainError("VALIDATION_FAILED","The from date must be on or before the to date.",400);
    const city=url.searchParams.get("city")??"All cities";
    const ownership=url.searchParams.get("ownership")??"All ownership";
    if(city!=="All cities"&&!data.cities.includes(city))throw new DomainError("VALIDATION_FAILED","Unknown city filter.",400);
    if(!["All ownership","Owned","Managed"].includes(ownership))throw new DomainError("VALIDATION_FAILED","Unknown ownership filter.",400);
    const scopeType=url.searchParams.get("scope")??"overall";
    const scope=resolveScope(scopeType,url,data);
    const entry=url.searchParams.get("entry")??"all";
    if(!["all","income","expense","owner-payment"].includes(entry))throw new DomainError("VALIDATION_FAILED","Unknown ledger entry filter.",400);
    const expenseHead=entry==="expense"?(url.searchParams.get("head")??""):"";
    if(expenseHead&&!data.ledgerAccounts.expenseHeads.includes(expenseHead))throw new DomainError("VALIDATION_FAILED","Unknown expense head.",400);
    const filters={from,to,city,ownership,scope};
    const carId=scope.type==="owner"?url.searchParams.get("vehicleId")??"":"";
    if(carId&&!data.ledgerAccounts.vehicles.some(item=>item.id===carId&&item.ownerId===(scope.type==="owner"?scope.ownerId:"")))throw new DomainError("VALIDATION_FAILED","Unknown car for this owner.",400);
    const entries=filterLedgerEntries(buildLedgerEntries(data.ledgerEntries,filters),entry as LedgerEntryType,scope.type==="owner",expenseHead).filter(row=>!carId||row.vehicleId===carId);
    const openingResult=entry==="all"?ledgerOpeningResult(data.ledgerEntries,filters):0;
    const accountLabel=`${expenseHead?`${expenseHead} expenses`:entryLabel(entry)} - ${labelForScope(scope,data)}`;
    const periodLabel=`${displayDate(from)} - ${displayDate(to)}`;
    const bytes=await createLedgerReportPdf({agencyName:data.agencyName,agencyAddress:data.agencyContact.address,agencyPhone:data.agencyContact.phone,from,to,periodLabel,city,ownership,accountLabel,entries,openingResult,ownerView:scope.type==="owner"});
    const fileName=`viberent-${slug(accountLabel)}-${from}-to-${to}.pdf`;
    return new Response(new Uint8Array(bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${fileName}"`,"cache-control":"private, no-store"}});
  }catch(error){
    const issue=asDomainError(error);
    return Response.json({error:{code:issue.code,message:issue.message}},{status:issue.status});
  }
}

function resolveScope(value:string,url:URL,data:Awaited<ReturnType<typeof getReports>>):LedgerScope{
  if(value==="overall")return {type:"overall"};
  if(value==="owner"){
    const ownerId=url.searchParams.get("ownerId")??"";
    if(!data.ledgerAccounts.owners.some(item=>item.id===ownerId))throw new DomainError("VALIDATION_FAILED","Unknown owner.",400);
    return {type:"owner",ownerId};
  }
  if(value==="vehicles"){
    const vehicleIds=[...new Set(url.searchParams.getAll("vehicleId"))];
    if(!vehicleIds.length)throw new DomainError("VALIDATION_FAILED","Select at least one car.",400);
    if(vehicleIds.some(id=>!data.ledgerAccounts.vehicles.some(item=>item.id===id)))throw new DomainError("VALIDATION_FAILED","Unknown vehicle.",400);
    return {type:"vehicles",vehicleIds};
  }
  throw new DomainError("VALIDATION_FAILED","Unknown report scope.",400);
}

function labelForScope(scope:LedgerScope,data:Awaited<ReturnType<typeof getReports>>){
  if(scope.type==="overall")return "Whole-system income and expense ledger";
  if(scope.type==="owner")return `Owner ledger - ${data.ledgerAccounts.owners.find(item=>item.id===scope.ownerId)?.label??"Owner"}`;
  if(scope.vehicleIds.length===1)return `Vehicle ledger - ${data.ledgerAccounts.vehicles.find(item=>item.id===scope.vehicleIds[0])?.label??"Vehicle"}`;
  return `Vehicle ledger - ${scope.vehicleIds.length} selected vehicles`;
}

function entryLabel(entry:string){
  if(entry==="income")return "Income";
  if(entry==="expense")return "Expenses";
  if(entry==="owner-payment")return "Owner and source payments";
  return "All entries";
}

function requiredDate(value:string|null,name:string){const timestamp=value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(`${value}T00:00:00Z`):Number.NaN;if(!value||Number.isNaN(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==value)throw new DomainError("VALIDATION_FAILED",`A valid ${name} date is required.`,400);return value}
function displayDate(value:string){return new Intl.DateTimeFormat("en-PK",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`))}
function slug(value:string){return value.toLowerCase().replaceAll(/[^a-z0-9]+/g,"-").replaceAll(/^-|-$/g,"")}
