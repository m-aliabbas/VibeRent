"use client";

import { useEffect, useMemo, useState } from "react";
import { CarFront, CheckCircle2, CirclePlus, Plus, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";
import { VehicleDetails } from "@/components/vehicles/vehicle-details";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/utils";
import { vehicles as initialVehicles, type Vehicle } from "@/lib/mock-data";

const pageSize = 5;
type SortState = { key: string; direction: "asc" | "desc" };

export default function VehiclesPage() {
  const [items, setItems] = useState<Vehicle[]>(initialVehicles);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [city, setCity] = useState("All");
  const [ownership, setOwnership] = useState("All");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: "vehicle", direction: "asc" });
  const [editing, setEditing] = useState<Vehicle | undefined>();
  const [viewing, setViewing] = useState<Vehicle | undefined>();
  const [removing, setRemoving] = useState<Vehicle | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 2600); return () => clearTimeout(timer); }, [notice]);

  const filtered = useMemo(() => items.filter((vehicle) => {
    const term = search.trim().toLowerCase();
    const matchesTerm = !term || `${vehicle.plate} ${vehicle.make} ${vehicle.model}`.toLowerCase().includes(term);
    return matchesTerm && (status === "All" || vehicle.status === status) && (city === "All" || vehicle.city === city) && (ownership === "All" || vehicle.ownership === ownership);
  }).sort((a, b) => {
    const get = (v: Vehicle) => sort.key === "vehicle" ? `${v.make} ${v.model}` : sort.key === "rate" ? v.dailyRate : String(v[sort.key as keyof Vehicle] ?? "");
    return String(get(a)).localeCompare(String(get(b)), undefined, { numeric: true }) * (sort.direction === "asc" ? 1 : -1);
  }), [items, search, status, city, ownership, sort]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = Boolean(search || status !== "All" || city !== "All" || ownership !== "All");
  const changeSort = (key: string) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const save = (vehicle: Vehicle) => { const exists = items.some((item) => item.id === vehicle.id); setItems((current) => exists ? current.map((item) => item.id === vehicle.id ? vehicle : item) : [vehicle, ...current]); setNotice(exists ? "Vehicle details updated." : `${vehicle.make} ${vehicle.model} added to the fleet.`); setEditing(undefined); };
  const remove = () => { if (!removing) return; setItems((current) => current.filter((item) => item.id !== removing.id)); setNotice(`${removing.make} ${removing.model} removed from the fleet.`); setRemoving(undefined); };
  const columns: DataColumn<Vehicle>[] = [
    { key: "plate", header: "Plate", sortable: true, cell: (v) => <span className="font-bold text-[#344054]">{v.plate}</span> },
    { key: "vehicle", header: "Vehicle", sortable: true, cell: (v) => <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]"><CarFront size={19}/></span><div><p className="font-semibold">{v.make} {v.model}</p><p className="mt-0.5 text-xs text-[#667085]">{v.year} · {v.category}</p></div></div> },
    { key: "city", header: "City", sortable: true, cell: (v) => <span className="text-[#475467]">{v.city}</span> },
    { key: "ownership", header: "Ownership", cell: (v) => <StatusBadge status={v.ownership}/> },
    { key: "status", header: "Status", sortable: true, cell: (v) => <StatusBadge status={v.status}/> },
    { key: "rate", header: "Daily rate", sortable: true, cell: (v) => <span className="font-semibold tabular-nums">{formatPkr(v.dailyRate)}</span> },
    { key: "actions", header: "", className: "w-12", cell: (v) => <ActionMenu onView={() => setViewing(v)} onEdit={() => { setEditing(v); setFormOpen(true); }} onDelete={() => setRemoving(v)}/> },
  ];

  return <div className="space-y-6">
    {notice && <div role="status" className="fixed right-4 top-20 z-40 flex max-w-[calc(100%-32px)] items-center gap-2 rounded-[10px] border border-[#ABEFC6] bg-white px-4 py-3 text-sm font-semibold text-[#067647] shadow-lg"><CheckCircle2 size={18}/>{notice}</div>}
    <PageHeader eyebrow="Fleet management" title="Vehicles" description="Track availability, rates, ownership, and the current location of every vehicle." actions={<Button onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus size={18}/>Add vehicle</Button>}/>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Fleet summary">
      {[{label:"Total fleet",value:items.length,icon:CarFront,tone:"text-[#006FE6] bg-[#EFF8FF]"},{label:"Available",value:items.filter(v=>v.status==="Available").length,icon:CirclePlus,tone:"text-[#067647] bg-[#ECFDF3]"},{label:"On booking",value:items.filter(v=>v.status==="Booked").length,icon:CarFront,tone:"text-[#5925DC] bg-[#F4F3FF]"},{label:"Needs attention",value:items.filter(v=>["Maintenance","Out of Service"].includes(v.status)).length,icon:Wrench,tone:"text-[#B54708] bg-[#FFFAEB]"}].map(({label,value,icon:Icon,tone})=><div key={label} className="flex items-center gap-3 rounded-xl border border-[#E8ECF2] bg-white p-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[9px] ${tone}`}><Icon size={18}/></span><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-[#667085]">{label}</p></div></div>)}
    </section>
    <FilterBar search={search} onSearch={(value) => { setSearch(value); setPage(1); }} hasFilters={hasFilters} onClear={() => { setSearch(""); setStatus("All"); setCity("All"); setOwnership("All"); setPage(1); }}><FilterSelect label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["Available", "Booked", "Maintenance", "Out of Service"]}/><FilterSelect label="City" value={city} onChange={(value) => { setCity(value); setPage(1); }} options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]}/><FilterSelect label="Ownership" value={ownership} onChange={(value) => { setOwnership(value); setPage(1); }} options={["Own", "Managed"]}/></FilterBar>
    <DataTable rows={visible} columns={columns} rowKey={(v) => v.id} sort={sort} onSort={changeSort} page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} empty={<EmptyState filtered={hasFilters}/>} mobileCard={(v) => <div><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]"><CarFront size={19}/></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{v.make} {v.model}</p><p className="mt-0.5 text-xs text-[#667085]">{v.plate} · {v.year} · {v.city}</p></div><ActionMenu onView={() => setViewing(v)} onEdit={() => { setEditing(v); setFormOpen(true); }} onDelete={() => setRemoving(v)}/></div><div className="mt-4 flex items-center justify-between border-t border-[#EAECF0] pt-3"><div className="flex gap-2"><StatusBadge status={v.status}/><StatusBadge status={v.ownership}/></div><span className="text-sm font-bold">{formatPkr(v.dailyRate)}<span className="font-normal text-[#667085]">/day</span></span></div></div>}/>
    {formOpen && <VehicleDialog open onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(undefined); }} vehicle={editing} onSave={save}/>} 
    <VehicleDetails vehicle={viewing} onClose={() => setViewing(undefined)} onEdit={(vehicle) => { setViewing(undefined); setEditing(vehicle); setFormOpen(true); }}/>
    <ConfirmDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(undefined)} title={`Remove ${removing?.plate ?? "vehicle"}?`} description="This removes the vehicle from this prototype fleet. Existing booking history would be preserved in a production system." onConfirm={remove}/>
  </div>;
}
