import Link from "next/link";
import { ArrowRight, Plus, ReceiptText } from "lucide-react";
import { formatPkr } from "@/lib/utils";
import { getWebRequestContext } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard-service";
import { getAgencyAccountSnapshot } from "@/server/services/report-service";
import type { AgencyAccountSummary } from "@/lib/reports/agency-account";
import { listVehicles } from "@/server/services/vehicle-service";
import { OdometerButton } from "@/components/dashboard/odometer-quick-update";
import { TodayQueue, type QueueRow } from "@/components/dashboard/today-queue";
import { Button } from "@/components/ui/button";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { listBookings } from "@/server/services/booking-service";


export default async function Dashboard() {
  const context = await getWebRequestContext();
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const canSeeAgencyAccount=context.roles.some(role=>["agency_owner","fleet_manager","accountant"].includes(role));
  const [data,vehicles,bookings,agency]=await Promise.all([getDashboard(context),listVehicles(context),listBookings(context),canSeeAgencyAccount?getAgencyAccountSnapshot(context):Promise.resolve(null)]);
  const queue=buildTodayQueue(bookings,today);
  const paymentsDueTotal=queue.filter(row=>row.kind==="payment").reduce((sum,row)=>sum+row.balance,0);
  const ledgerHref=(entry:string)=>`/reports?tab=Ledger&from=${today}&to=${today}&entry=${entry}`;

  return <div className="space-y-5">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[28px] font-bold tracking-[-.03em] text-[#19191F]">Today</h1><p className="mt-0.5 text-sm text-[#475467]">{new Intl.DateTimeFormat("en-PK",{weekday:"long",day:"numeric",month:"long",timeZone:"Asia/Karachi"}).format(new Date())}</p></div><div className="flex flex-wrap gap-2"><OdometerButton vehicles={vehicles.filter(item=>item.status!=="Archived").map(item=>({id:item.id,label:`${item.plate} · ${item.make} ${item.model}`,lastOdometer:item.lastOdometer}))}/><Button asChild variant="secondary" shortcut="shift+e"><Link href="/expenses?new=1"><ReceiptText size={17}/>Record expense</Link></Button><Button asChild shortcut="n"><Link href="/bookings/new"><Plus size={17}/>New booking</Link></Button></div></section>

    <section aria-label="Money today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      {label:"Income",key:"income" as const,entry:"income"},
      {label:"Expenses",key:"expenses" as const,entry:"expense"},
      {label:"Owner & source payments",key:"ownerPayments" as const,entry:"owner-payment"},
      {label:"Net profit",key:"netProfit" as const,entry:"all"},
    ].map(({label,key,entry})=><Link href={ledgerHref(entry)} key={label} aria-label={`Open ${label.toLowerCase()} ledger for today`} className="group rounded-xl border border-[#E8ECF2] bg-white p-4 transition hover:border-[#84CAFF]"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#475467]">{label} · today</p><ArrowRight size={14} className="text-[#667085] group-hover:text-[#006FE6]"/></div><p className={`mt-1 text-xl font-bold tabular-nums ${key==="netProfit"&&data.finance.today[key]<0?"text-[#B42318]":""}`}>{formatPkr(data.finance.today[key])}</p><p className="mt-1 text-xs text-[#475467] tabular-nums">Month <strong className="text-[#344054]">{formatPkr(data.finance.month[key])}</strong> · Last month <strong className="text-[#344054]">{formatPkr(data.finance.previousMonth[key])}</strong></p></Link>)}</section>

    {agency&&<section aria-labelledby="agency-account-heading" className="rounded-xl border border-[#E8ECF2] bg-white p-4">
      <div className="flex items-center justify-between gap-3"><div><h2 id="agency-account-heading" className="text-sm font-bold text-[#19191F]">Agency account</h2><p className="text-xs text-[#475467]">Agency-owned income after owner shares, supplier costs and agency expenses</p></div><Link href={`/reports?tab=Agency%20account&from=${agency.dates.monthStart}&to=${agency.dates.today}`} className="shrink-0 text-xs font-semibold text-[#0058B8] hover:underline">Open account</Link></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">{([
        ["Today",agency.today,agency.dates.today,agency.dates.today],
        ["This month",agency.month,agency.dates.monthStart,agency.dates.today],
        ["Last month",agency.previousMonth,agency.dates.previousMonthStart,agency.dates.previousMonthEnd],
      ] as const).map(([label,summary,from,to])=><AgencyCard key={label} label={label} summary={summary} href={`/reports?tab=Agency%20account&from=${from}&to=${to}`}/>)}</div>
    </section>}




    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
      <TodayQueue rows={queue} paymentsDueTotal={paymentsDueTotal}/>
      <div className="space-y-4">
        <QuickActions/>

      </div>
    </div>
  </div>;
}

function AgencyCard({label,summary,href}:{label:string;summary:AgencyAccountSummary;href:string}){
  const income=summary.ownCars+summary.managedShare+summary.externalCommission+summary.otherIncome;
  return <Link href={href} aria-label={`Open agency account for ${label.toLowerCase()}`} className="group rounded-lg border border-[#E8ECF2] bg-[#F8FAFC] p-3 transition hover:border-[#84CAFF]">
    <div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#475467]">{label}</p><ArrowRight size={14} className="text-[#667085] group-hover:text-[#006FE6]"/></div>
    <p className={`mt-1 text-xl font-bold tabular-nums ${summary.net<0?"text-[#B42318]":"text-[#19191F]"}`}>{formatPkr(summary.net)}</p>
    <p className="mt-1 text-xs text-[#475467] tabular-nums">Income <strong className="text-[#067647]">{formatPkr(income)}</strong> · Expenses <strong className="text-[#B42318]">{formatPkr(summary.expenses)}</strong></p>
  </Link>;
}

function buildTodayQueue(bookings:Awaited<ReturnType<typeof listBookings>>,today:string):QueueRow[]{
  const now=new Date().getTime();
  const dayKey=(value:string|Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
  const reference=(item:{id:string;publicNumber:number|null})=>item.publicNumber?`#${item.publicNumber}`:item.id.startsWith("BKG-")?item.id:"";
  return bookings.flatMap(item=>{
    const base={bookingId:item.id,reference:reference(item),customer:item.customer,vehicle:item.vehicle,plate:item.plate,balance:Math.max(0,item.totalAmount-item.paid)};
    const rows:QueueRow[]=[];
    if(item.status==="Checked Out"){const due=new Date(item.returnAt).getTime();if(due<now)rows.push({...base,key:`${item.id}-overdue`,kind:"overdue",time:item.returnAt});else if(dayKey(item.returnAt)===today)rows.push({...base,key:`${item.id}-return`,kind:"return",time:item.returnAt});}
    if(item.status==="Confirmed"){const start=new Date(item.pickupAt).getTime();if(start<now&&now-start>86_400_000)rows.push({...base,key:`${item.id}-missed`,kind:"missed-pickup",time:item.pickupAt});else if(start<now)rows.push({...base,key:`${item.id}-late`,kind:"late-pickup",time:item.pickupAt});else if(dayKey(item.pickupAt)===today)rows.push({...base,key:`${item.id}-pickup`,kind:"pickup",time:item.pickupAt});}
    if(["Checked Out","Completed"].includes(item.status)&&base.balance>0)rows.push({...base,key:`${item.id}-payment`,kind:"payment",time:item.returnAt});
    return rows;
  }).sort((a,b)=>{const rank={overdue:0,"late-pickup":1,pickup:2,return:2,"missed-pickup":3,payment:4};return rank[a.kind]-rank[b.kind]||(a.kind==="payment"?b.balance-a.balance:a.time.localeCompare(b.time))});
}
