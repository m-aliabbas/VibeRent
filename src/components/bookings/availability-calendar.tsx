"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { AvailabilityBlockDto } from "@/server/services/booking-service";
import type { Vehicle } from "@/types/vehicle";

type CalendarRange = "Day" | "Week" | "Month";
type ScheduleFilter = "All vehicles" | "Has schedule" | "Fully available";
export type CalendarSelection = { vehicleId: string; date: Date };
type CalendarEvent = {
  id: string;
  vehicleId: string;
  from: string;
  to: string;
  label: string;
  kind: string;
  href?: string;
};

const pageSizes = [10, 25, 50, 100];

export function AvailabilityCalendar({
  bookings,
  vehicles,
  blocks,
  onCreateBlock,
}: {
  bookings: BookingListItem[];
  vehicles: Vehicle[];
  blocks: AvailabilityBlockDto[];
  onCreateBlock: (selection: CalendarSelection) => void;
}) {
  const [range, setRange] = useState<CalendarRange>("Week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("All cities");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("All vehicles");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const dates = useMemo(() => datesForRange(anchor, range), [anchor, range]);
  const periodStart = dates[0];
  const periodEnd = addDays(dates.at(-1)!, 1);
  const events = useMemo<CalendarEvent[]>(() => [
    ...bookings.flatMap(item => !["Cancelled", "No Show", "Draft"].includes(item.status)&&item.vehicleId
      ? [{ id: item.id, vehicleId: item.vehicleId, from: item.pickupAt, to: item.returnAt, label: item.id, kind: item.status, href: `/bookings/${item.id}` }]
      : []),
    ...blocks.map(item => ({ id: item.id, vehicleId: item.vehicleId, from: item.from, to: item.to, label: item.reason, kind: item.kind })),
  ], [bookings, blocks]);
  const eventsByVehicle = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) grouped.set(event.vehicleId, [...(grouped.get(event.vehicleId) ?? []), event]);
    return grouped;
  }, [events]);
  const cities = useMemo(() => Array.from(new Set(vehicles.map(vehicle => vehicle.city))).sort(), [vehicles]);
  const filtered = useMemo(() => vehicles.filter(vehicle => {
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || `${vehicle.make} ${vehicle.model} ${vehicle.year} ${vehicle.plate}`.toLowerCase().includes(term);
    const matchesCity = city === "All cities" || vehicle.city === city;
    const hasSchedule = (eventsByVehicle.get(vehicle.id) ?? []).some(event => overlaps(event, periodStart, periodEnd));
    const matchesSchedule = scheduleFilter === "All vehicles" || (scheduleFilter === "Has schedule" ? hasSchedule : !hasSchedule);
    return matchesQuery && matchesCity && matchesSchedule;
  }), [vehicles, query, city, scheduleFilter, eventsByVehicle, periodStart, periodEnd]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleVehicles = filtered.slice(pageStart, pageStart + pageSize);
  const cellWidth = range === "Month" ? 42 : range === "Week" ? 112 : 260;
  const vehicleWidth = 196;
  const columns = `${vehicleWidth}px repeat(${dates.length}, ${cellWidth}px)`;
  const todayKey = dateKey(new Date());
  const hasFilters = Boolean(query || city !== "All cities" || scheduleFilter !== "All vehicles");

  function changeRange(next: CalendarRange) {
    setRange(next);
    setPage(1);
    if (next === "Month") setAnchor(startOfMonth(anchor));
    if (next === "Week") setAnchor(startOfWeek(anchor));
  }
  function move(direction: -1 | 1) {
    setAnchor(current => range === "Month" ? addMonths(startOfMonth(current), direction) : addDays(current, direction * (range === "Week" ? 7 : 1)));
  }
  function clearFilters() {
    setQuery(""); setCity("All cities"); setScheduleFilter("All vehicles"); setPage(1);
  }

  return <section className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03)]">
    <div className="flex flex-col gap-3 border-b border-[#E4E7EC] p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label={`Previous ${range.toLowerCase()}`} onClick={() => move(-1)}><ChevronLeft size={18}/></Button>
        <strong className="min-w-0 flex-1 px-1 text-sm text-[#19191F] sm:min-w-56 sm:text-center">{periodLabel(dates, range)}</strong>
        <Button size="icon" variant="ghost" aria-label={`Next ${range.toLowerCase()}`} onClick={() => move(1)}><ChevronRight size={18}/></Button>
        <Button size="sm" variant="secondary" onClick={() => setAnchor(range === "Month" ? startOfMonth(new Date()) : range === "Week" ? startOfWeek(new Date()) : startOfDay(new Date()))}>Today</Button>
      </div>
      <div className="grid grid-cols-3 rounded-[10px] bg-[#F2F4F7] p-1" role="group" aria-label="Calendar range">
        {(["Day", "Week", "Month"] as CalendarRange[]).map(item => <Button key={item} size="sm" variant={range === item ? "primary" : "ghost"} aria-pressed={range === item} onClick={() => changeRange(item)}>{item}</Button>)}
      </div>
    </div>

    <div className="grid gap-2 border-b border-[#E4E7EC] bg-[#F8FAFC] p-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,auto)]">
      <label className="flex h-10 items-center gap-2 rounded-[9px] border border-[#D0D5DD] bg-white px-3 focus-within:border-[#006FE6] focus-within:ring-2 focus-within:ring-[#006FE6]/10">
        <Search size={16} className="text-[#98A2B3]"/><span className="sr-only">Search fleet</span>
        <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search vehicle or plate…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"/>
      </label>
      <PlannerSelect label="City" value={city} onChange={value => { setCity(value); setPage(1); }} options={["All cities", ...cities]}/>
      <PlannerSelect label="Schedule" value={scheduleFilter} onChange={value => { setScheduleFilter(value as ScheduleFilter); setPage(1); }} options={["All vehicles", "Has schedule", "Fully available"]}/>
      <PlannerSelect label="Rows" value={String(pageSize)} onChange={value => { setPageSize(Number(value)); setPage(1); }} options={pageSizes.map(String)} suffix=" rows"/>
    </div>

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E4E7EC] px-3 py-2 text-xs text-[#667085]">
      <Legend tone="bg-[#1570EF]" label="Confirmed"/><Legend tone="bg-[#6941C6]" label="Checked out"/><Legend tone="bg-[#F79009]" label="Blocked / maintenance"/>
      <span className="sm:ml-auto">{filtered.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length}` : "No matching vehicles"} · {events.length} scheduled items</span>
      {hasFilters && <button className="font-semibold text-[#006FE6] hover:underline" onClick={clearFilters}>Clear filters</button>}
    </div>

    {filtered.length ? <div className="max-h-[min(68vh,720px)] overflow-auto overscroll-contain" tabIndex={0} aria-label={`${range} vehicle availability planner`}>
      <div style={{ minWidth: vehicleWidth + dates.length * cellWidth }}>
        <div className="sticky top-0 z-30 grid border-b border-[#D0D5DD] bg-[#F8FAFC]" style={{ gridTemplateColumns: columns }}>
          <span className="sticky left-0 z-40 border-r border-[#D0D5DD] bg-[#F8FAFC] px-3 py-2.5 text-xs font-semibold text-[#475467]">Vehicle</span>
          {dates.map(date => {
            const today = dateKey(date) === todayKey;
            return <span key={date.toISOString()} className={`border-l border-[#EAECF0] px-1 py-2 text-center text-[11px] font-semibold ${today ? "bg-[#EFF8FF] text-[#0058B8]" : "text-[#475467]"}`}><span className="block sm:hidden">{shortDay(date)}</span><span className="hidden sm:block">{dateHeader(date, range)}</span></span>;
          })}
        </div>
        {visibleVehicles.map((vehicle, rowIndex) => <div key={vehicle.id} className="grid border-b border-[#EAECF0] last:border-0" style={{ gridTemplateColumns: columns }}>
          <div className={`sticky left-0 z-20 flex min-h-14 items-center border-r border-[#D0D5DD] px-3 py-2 ${rowIndex % 2 ? "bg-[#FCFCFD]" : "bg-white"}`}>
            <div className="min-w-0"><strong className="block truncate text-xs text-[#19191F]">{vehicle.make} {vehicle.model} {vehicle.year}</strong><p className="mt-0.5 truncate text-[11px] text-[#667085]">{vehicle.plate} · {vehicle.city}</p></div>
          </div>
          {dates.map(date => <PlannerCell key={date.toISOString()} date={date} range={range} vehicle={vehicle} events={eventsByVehicle.get(vehicle.id) ?? []} isToday={dateKey(date) === todayKey} onCreateBlock={onCreateBlock}/>)}
        </div>)}
      </div>
    </div> : <div className="grid min-h-52 place-items-center px-4 text-center"><div><CalendarDays className="mx-auto text-[#98A2B3]"/><p className="mt-3 text-sm font-semibold text-[#344054]">No vehicles match these filters</p><button onClick={clearFilters} className="mt-2 text-sm font-semibold text-[#006FE6] hover:underline">Show all vehicles</button></div></div>}

    <div className="flex flex-col gap-3 border-t border-[#E4E7EC] bg-[#F8FAFC] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#667085]">Select an empty date to create an operational block. Bookings open their detail page.</p>
      {filtered.length > pageSize && <div className="flex items-center justify-between gap-2"><Button size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><span className="min-w-20 text-center text-xs font-semibold text-[#475467]">Page {currentPage} of {totalPages}</span><Button size="sm" variant="secondary" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</Button></div>}
    </div>
  </section>;
}

function PlannerCell({ date, range, vehicle, events, isToday, onCreateBlock }: { date: Date; range: CalendarRange; vehicle: Vehicle; events: CalendarEvent[]; isToday: boolean; onCreateBlock: (selection: CalendarSelection) => void }) {
  const dayEnd = addDays(date, 1);
  const event = events.find(item => overlaps(item, date, dayEnd));
  const compact = range === "Month";
  if (!event) return <button className={`group relative min-h-14 border-l border-[#EAECF0] focus:z-10 focus:outline-2 focus:outline-[#006FE6] ${isToday ? "bg-[#F5FAFF]" : "hover:bg-[#F8FAFC]"}`} onClick={() => onCreateBlock({ vehicleId: vehicle.id, date })} aria-label={`${vehicle.make} ${vehicle.model}, ${longDate(date)}: available. Create block.`}><Plus size={compact ? 12 : 15} className="mx-auto text-[#98A2B3] opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"/></button>;
  const startsHere = new Date(event.from) >= date && new Date(event.from) < dayEnd;
  const endsHere = new Date(event.to) > date && new Date(event.to) <= dayEnd;
  const tone = eventTone(event.kind);
  const content = <span className={`flex min-h-8 items-center overflow-hidden border-y px-1.5 text-[10px] font-semibold ${tone} ${startsHere ? "ml-1 rounded-l-md border-l" : "-ml-px"} ${endsHere ? "mr-1 rounded-r-md border-r" : "-mr-px"}`} title={`${event.label} · ${event.kind}`}>{(startsHere || !compact) && <span className="truncate">{compact && !startsHere ? "" : event.label}</span>}<span className="sr-only">{event.kind}, {longDate(new Date(event.from))} to {longDate(new Date(event.to))}</span></span>;
  return <div className={`grid min-h-14 items-center border-l border-[#EAECF0] ${isToday ? "bg-[#F5FAFF]" : ""}`}>{event.href ? <Link href={event.href} className="focus:z-10 focus:outline-2 focus:outline-[#006FE6]" aria-label={`Open ${event.label}, ${event.kind}`}>{content}</Link> : content}</div>;
}

function PlannerSelect({ label, value, onChange, options, suffix = "" }: { label: string; value: string; onChange: (value: string) => void; options: string[]; suffix?: string }) {
  return <label className="block"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm font-medium text-[#344054] outline-none focus:border-[#006FE6] md:w-auto">{options.map(option => <option key={option} value={option}>{option}{suffix}</option>)}</select></label>;
}
function Legend({ tone, label }: { tone: string; label: string }) { return <span className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-sm ${tone}`}/>{label}</span>; }
function eventTone(kind: string) { const normalized = kind.toLowerCase().replaceAll("_", " "); return normalized === "checked out" ? "border-[#D6BBFB] bg-[#F4EBFF] text-[#5925DC]" : normalized === "confirmed" ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" : "border-[#FEC84B] bg-[#FFFAEB] text-[#B54708]"; }
function overlaps(event: { from: string; to: string }, start: Date, end: Date) { return new Date(event.from) < end && new Date(event.to) > start; }
function startOfDay(value: Date) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function startOfWeek(value: Date) { const date = startOfDay(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return date; }
function startOfMonth(value: Date) { return new Date(value.getFullYear(), value.getMonth(), 1); }
function addDays(value: Date, count: number) { const date = new Date(value); date.setDate(date.getDate() + count); return date; }
function addMonths(value: Date, count: number) { return new Date(value.getFullYear(), value.getMonth() + count, 1); }
function datesForRange(anchor: Date, range: CalendarRange) { const start = range === "Month" ? startOfMonth(anchor) : range === "Week" ? startOfWeek(anchor) : startOfDay(anchor); const count = range === "Month" ? new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() : range === "Week" ? 7 : 1; return Array.from({ length: count }, (_, index) => addDays(start, index)); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function shortDay(value: Date) { return new Intl.DateTimeFormat("en-PK", { day: "2-digit" }).format(value); }
function longDate(value: Date) { return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(value); }
function dateHeader(value: Date, range: CalendarRange) { return new Intl.DateTimeFormat("en-PK", range === "Month" ? { day: "2-digit" } : { weekday: "short", day: "2-digit", month: "short" }).format(value); }
function periodLabel(dates: Date[], range: CalendarRange) { if (range === "Month") return new Intl.DateTimeFormat("en-PK", { month: "long", year: "numeric" }).format(dates[0]); if (range === "Day") return new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(dates[0]); return `${new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short" }).format(dates[0])} – ${new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric" }).format(dates.at(-1)!)}`; }
