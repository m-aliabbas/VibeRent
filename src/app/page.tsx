import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, CarFront, CircleDollarSign, Clock3, FileText, Hand, MapPin, Plus, ReceiptText, TrendingUp, Users, Zap } from "lucide-react";
import { formatPkr } from "@/lib/utils";
import { TimeGreeting } from "@/components/dashboard/time-greeting";

const stats = [
  { label: "Total Vehicles", value: "28", note: "All vehicles", icon: CarFront, noteIcon: CarFront },
  { label: "Active Rentals", value: "12", note: "Currently rented", icon: CalendarDays, noteIcon: CalendarDays },
  { label: "Today’s Revenue", value: formatPkr(67400), note: "Total collected today", icon: CircleDollarSign, noteIcon: CircleDollarSign },
  { label: "Utilization", value: "81%", note: "Fleet utilization rate", icon: TrendingUp, noteIcon: TrendingUp },
];

const schedule = [
  { time: "09:00 AM", type: "Pickup", customer: "Usman Khan", vehicle: "Toyota Corolla 2023", plate: "LEB-218", location: "Lahore Airport", image: "0% 0%" },
  { time: "11:30 AM", type: "Return", customer: "Ayesha Malik", vehicle: "Honda City 2022", plate: "ICT-704", location: "Gulberg Pickup Point", image: "100% 0%" },
  { time: "02:00 PM", type: "Pickup", customer: "Bilal Ahmed", vehicle: "Hyundai Tucson 2023", plate: "LHR-529", location: "DHA Branch", image: "0% 100%" },
  { time: "04:30 PM", type: "Return", customer: "Hassan Raza", vehicle: "Suzuki Alto 2021", plate: "RIK-113", location: "Johar Town Drop-off", image: "100% 100%" },
];

const actions = [
  { title: "Create New Booking", description: "Reserve a vehicle for a customer", icon: CalendarDays, href: "/bookings" },
  { title: "Add New Vehicle", description: "Add a vehicle to your fleet", icon: CarFront, href: "/vehicles" },
  { title: "Record Expense", description: "Log an expense or payment", icon: ReceiptText, href: "/expenses" },
  { title: "Generate Report", description: "View reports and insights", icon: BarChart3, href: "/reports" },
];

const activity = [
  { title: "New booking created", detail: "Usman Khan · Toyota Corolla", time: "Today, 08:15 AM", icon: Users, tone: "bg-[#EAF3FF] text-[#0878F9]" },
  { title: "Vehicle returned", detail: "Honda City · Ayesha Malik", time: "Today, 07:45 AM", icon: CarFront, tone: "bg-[#EAF3FF] text-[#0878F9]" },
  { title: "Payment recorded", detail: `${formatPkr(12500)} · Booking #BK1245`, time: "Today, 07:30 AM", icon: CircleDollarSign, tone: "bg-[#ECFDF3] text-[#079455]" },
  { title: "New expense added", detail: `Fuel · ${formatPkr(8200)}`, time: "Today, 06:50 AM", icon: FileText, tone: "bg-[#FFF4E8] text-[#F79009]" },
];

function VehicleThumb({ position }: { position: string }) {
  return <div role="img" aria-label="Vehicle photo" className="h-[58px] w-[92px] shrink-0 rounded-lg bg-[#E8EBF0] bg-[url('/images/vehicle-sprite.png')] bg-[length:200%_200%] bg-no-repeat shadow-inner" style={{ backgroundPosition: position }} />;
}

export default function Dashboard() {
  return <div className="space-y-5">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-2"><h1 className="text-[30px] font-extrabold tracking-[-.035em] text-[#0D1730] sm:text-[34px]"><TimeGreeting name="Ali" /></h1><Hand size={29} className="rotate-[-12deg] fill-[#FFC83D] text-[#E6A900]" aria-hidden="true"/></div><p className="mt-1 text-[15px] text-[#4E596C]">Here’s what’s happening with your rental business today.</p></div>
      <Link href="/bookings" className="inline-flex h-10 w-fit items-center gap-2 rounded-[9px] bg-[#0878F9] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#0066D6]"><Plus size={17}/>New booking</Link>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Business overview">
      {stats.map(({ label, value, note, icon: Icon, noteIcon: NoteIcon }) => <article key={label} className="rounded-xl border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_7px_rgba(16,24,40,.055)]"><div className="flex items-center gap-3.5"><span className="grid h-13 w-13 shrink-0 place-items-center rounded-xl bg-[#EAF3FF] text-[#0878F9]"><Icon size={26} strokeWidth={2}/></span><div><p className="text-sm text-[#344054]">{label}</p><p className="mt-0.5 text-[28px] font-extrabold leading-none tracking-[-.035em] text-[#0D1730]">{value}</p></div></div><div className="mt-4 flex items-center gap-2 text-sm text-[#5C6678]"><NoteIcon size={16} className="text-[#55708E]"/><span>{note}</span></div></article>)}
    </section>

    <div className="grid gap-4 xl:grid-cols-[1.42fr_1fr]">
      <section className="overflow-hidden rounded-xl border border-[#E3E7ED] bg-white shadow-[0_2px_7px_rgba(16,24,40,.055)]">
        <div className="flex items-center justify-between border-b border-[#E9ECF1] px-4 py-3.5 sm:px-5"><div className="flex items-center gap-2.5"><CalendarDays size={21} className="text-[#101828]"/><h2 className="text-[17px] font-bold text-[#101828]">Today’s Pickups & Returns</h2></div><Link href="/bookings" className="hidden items-center gap-1 text-sm font-medium text-[#006FE6] hover:underline sm:flex">View all bookings <ArrowRight size={16}/></Link></div>
        <div className="divide-y divide-[#E9ECF1]">{schedule.map((item) => <Link href="/bookings" key={`${item.time}-${item.plate}`} className="grid min-h-[92px] grid-cols-[82px_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAFCFF] sm:grid-cols-[88px_92px_1.2fr_1fr_90px_18px] sm:px-5">
          <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-bold uppercase ${item.type === "Pickup" ? "bg-[#E9F8EE] text-[#137A36]" : "bg-[#E8F2FF] text-[#0969DA]"}`}>{item.type}</span><div className="hidden sm:block"><VehicleThumb position={item.image}/></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#111827]">{item.vehicle}</p><span className="mt-1 inline-block rounded border border-[#D6DAE1] bg-[#FAFAFB] px-1.5 py-0.5 text-[11px] font-medium text-[#344054]">{item.plate}</span></div><div className="col-start-2 row-start-2 min-w-0 sm:col-start-auto sm:row-start-auto"><p className="truncate text-sm font-semibold text-[#111827]">{item.customer}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-[#667085]"><MapPin size={11} className={item.type === "Pickup" ? "text-[#12B76A]" : "text-[#2E90FA]"}/>{item.location}</p></div><span className="col-start-3 row-start-2 whitespace-nowrap text-xs font-semibold text-[#344054] sm:col-start-auto sm:row-start-auto sm:text-sm">{item.time}</span><ArrowRight size={16} className="hidden text-[#475467] sm:block"/>
        </Link>)}</div>
      </section>

      <div className="space-y-4">
        <section className="rounded-xl border border-[#E3E7ED] bg-white p-3.5 shadow-[0_2px_7px_rgba(16,24,40,.055)]"><div className="mb-1 flex items-center gap-2 px-1"><Zap size={19} className="text-[#101828]"/><h2 className="text-[17px] font-bold text-[#101828]">Quick Actions</h2></div><div className="divide-y divide-[#E9ECF1]">{actions.map(({title,description,icon:Icon,href}) => <Link key={title} href={href} className="flex items-center gap-3 px-1 py-2.5 hover:bg-[#FAFCFF]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[#EAF3FF] text-[#0878F9]"><Icon size={19}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#101828]">{title}</span><span className="mt-0.5 block truncate text-xs text-[#667085]">{description}</span></span><span className="text-xl text-[#344054]">›</span></Link>)}</div></section>

        <section className="rounded-xl border border-[#E3E7ED] bg-white p-3.5 shadow-[0_2px_7px_rgba(16,24,40,.055)]"><div className="mb-1 flex items-center justify-between px-1"><div className="flex items-center gap-2"><Clock3 size={19}/><h2 className="text-[17px] font-bold text-[#101828]">Recent Activity</h2></div><Link href="/bookings" className="flex items-center gap-1 text-xs font-medium text-[#006FE6] hover:underline">View all <ArrowRight size={14}/></Link></div><div className="divide-y divide-[#E9ECF1]">{activity.map(({title,detail,time,icon:Icon,tone}) => <div key={`${title}-${time}`} className="flex items-center gap-3 px-1 py-2.5"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}><Icon size={15}/></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[#101828]">{title}</p><p className="mt-0.5 truncate text-[11px] text-[#667085]">{detail}</p></div><span className="whitespace-nowrap text-[10px] text-[#667085]">{time}</span></div>)}</div></section>
      </div>
    </div>
  </div>;
}
