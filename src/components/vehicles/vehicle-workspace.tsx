"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarPlus,
  Camera,
  CarFront,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  Repeat2,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { Toast } from "@/components/shared/toast";
import {
  DetailPanel as Panel,
  Timeline,
} from "@/components/shared/detail-layout";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";
import {
  VehicleOperationDialog,
  type VehicleOperation,
} from "@/components/vehicles/vehicle-operation-dialog";
import {
  StatusTransitionDialog,
  type StatusTransitionInput,
} from "@/components/vehicles/status-transition-dialog";
import { vehicleRepository } from "@/lib/repositories/vehicle-repository";
import type { RepositoryResult } from "@/lib/repositories/repository";
import {
  defaultVehicleOperations,
  vehicleActivity,
  vehicleBookings,
  vehicleExpenses,
  vehicleMaintenance,
  vehicleOperationalData,
  vehicleStatusHistory,
  type VehicleDetailTab,
  type VehicleStatusEvent,
} from "@/lib/vehicle-detail-data";
import { formatPkr } from "@/lib/utils";
import type { Vehicle } from "@/types/vehicle";

const tabs: { id: VehicleDetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents & media" },
  { id: "bookings", label: "Bookings" },
  { id: "expenses", label: "Expenses" },
  { id: "maintenance", label: "Maintenance" },
  { id: "activity", label: "Activity" },
];

export function VehicleWorkspace({ vehicleId }: { vehicleId: string }) {
  const [vehicle, setVehicle] = useState<Vehicle>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusEvents, setStatusEvents] = useState<VehicleStatusEvent[]>(
    () => vehicleStatusHistory[vehicleId] ?? [],
  );
  const [notice, setNotice] = useState("");
  const [operation, setOperation] = useState<VehicleOperation>();
  const [tab, setTab] = useState<VehicleDetailTab>("overview");

  const load = async () => {
    setLoading(true);
    setError("");
    const result = await vehicleRepository.getById(vehicleId);
    if (result.ok) setVehicle(result.data);
    else setError(result.error.message);
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    void vehicleRepository.getById(vehicleId).then((result) => {
      if (!active) return;
      if (result.ok) setVehicle(result.data);
      else setError(result.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [vehicleId]);

  const save = async (next: Vehicle): Promise<RepositoryResult<Vehicle>> => {
    const result = await vehicleRepository.save(next);
    if (result.ok) {
      setVehicle(result.data);
      setEditing(false);
    }
    return result;
  };

  const changeStatus = async (input: StatusTransitionInput) => {
    if (!vehicle) return false;
    const previousStatus = vehicle.status;
    const result = await vehicleRepository.save({
      ...vehicle,
      status: input.to,
    });
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setVehicle(result.data);
    setStatusEvents((current) => [
      {
        id: `status-${Date.now()}`,
        from: previousStatus,
        to: input.to,
        reason: input.reason,
        notes: input.notes || undefined,
        effectiveAt: input.effectiveAt,
        actor: "Ali Raza",
      },
      ...current,
    ]);
    return true;
  };
  const completeOperation = async (
    update: Partial<Vehicle>,
    message: string,
  ) => {
    if (!vehicle) return;
    const result = await vehicleRepository.save({ ...vehicle, ...update });
    if (result.ok) {
      setVehicle(result.data);
      setNotice(message);
    }
  };

  if (loading) return <LoadingState label="Loading vehicle workspace" />;
  if (error || !vehicle)
    return (
      <div className="space-y-5">
        <Button asChild variant="ghost">
          <Link href="/vehicles">
            <ArrowLeft size={17} />
            Back to vehicles
          </Link>
        </Button>
        <InlineError
          message={error || "Vehicle not found."}
          onRetry={() => void load()}
        />
      </div>
    );

  const operations =
    vehicleOperationalData[vehicle.id as keyof typeof vehicleOperationalData] ??
    defaultVehicleOperations;
  const net = operations.monthRevenue - operations.monthExpenses;

  return (
    <div className="space-y-6">
      <Toast message={notice} onDismiss={() => setNotice("")} />
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#475467] hover:text-[#006FE6]"
      >
        <ArrowLeft size={17} />
        Vehicles
      </Link>
      <section className="flex flex-col gap-5 rounded-xl border border-[#E8ECF2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.03)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#EAF4FF] text-[#006FE6]">
            <CarFront size={27} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-[-.03em]">
                {vehicle.make} {vehicle.model}
              </h1>
              <StatusBadge status={vehicle.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-[#667085]">
              <strong className="text-[#344054]">{vehicle.plate}</strong>
              <span>·</span>
              <span>
                {vehicle.year} {vehicle.category}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} />
                {vehicle.city}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/bookings">
              <CalendarPlus size={17} />
              Create booking
            </Link>
          </Button>
          <Button variant="secondary" onClick={() => setChangingStatus(true)}>
            <Repeat2 size={17} />
            Change status
          </Button>
          <Button
            variant="secondary"
            onClick={() => setOperation("maintenance")}
          >
            <Wrench size={17} />
            Maintenance
          </Button>
          <Button variant="secondary" onClick={() => setOperation("transfer")}>
            <ArrowRightLeft size={17} />
            Transfer
          </Button>
          <Button variant="secondary" onClick={() => setOperation("rate")}>
            <CircleDollarSign size={17} />
            Rate card
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil size={17} />
            Edit vehicle
          </Button>
        </div>
      </section>
      <div className="overflow-x-auto border-b border-[#DDE3EA]">
        <div
          className="flex min-w-max gap-1"
          role="tablist"
          aria-label="Vehicle records"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === item.id ? "border-[#006FE6] text-[#006FE6]" : "border-transparent text-[#667085] hover:text-[#344054]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: "Monthly revenue",
                value: formatPkr(operations.monthRevenue),
                icon: CircleDollarSign,
              },
              { label: "Net contribution", value: formatPkr(net), icon: Gauge },
              {
                label: "Utilization",
                value: operations.utilization,
                icon: Clock3,
              },
              { label: "Odometer", value: operations.odometer, icon: CarFront },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-[#E8ECF2] bg-white p-4"
              >
                <span className="grid h-9 w-9 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]">
                  <Icon size={18} />
                </span>
                <p className="mt-4 text-lg font-bold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-[#667085]">{label} · Sep</p>
              </div>
            ))}
          </section>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <Panel title="Vehicle information">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
                {[
                  ["Daily rate", formatPkr(vehicle.dailyRate)],
                  ["Ownership", vehicle.ownership],
                  ["Owner", vehicle.owner || "Agency owned"],
                  ["Transmission", vehicle.transmission],
                  ["Fuel", vehicle.fuel],
                  ["Color", vehicle.color],
                  ["Next booking", operations.nextBooking],
                  ["Category", vehicle.category],
                  ["Current city", vehicle.city],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-[#667085]">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[#344054]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
            {vehicle.ownership === "Managed" && vehicle.agreement && (
              <Panel title="Owner agreement">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-[#667085]">Owner</dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {vehicle.owner}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#667085]">Commercial terms</dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {vehicle.agreement.shareMethod === "Percentage"
                        ? `${vehicle.agreement.ownerShare}% owner share`
                        : `${formatPkr(vehicle.agreement.ownerShare)} monthly`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#667085]">Agreement term</dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {vehicle.agreement.effectiveFrom} –{" "}
                      {vehicle.agreement.effectiveTo}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#667085]">
                      Expenses / payout
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {vehicle.agreement.expenseResponsibility} ·{" "}
                      {vehicle.agreement.payoutFrequency}
                    </dd>
                  </div>
                </dl>
              </Panel>
            )}
            <Panel
              title="Documents"
              action={
                <span className="text-xs font-semibold text-[#067647]">
                  {
                    operations.documents.filter((doc) => doc.status === "Valid")
                      .length
                  }{" "}
                  of {operations.documents.length} valid
                </span>
              }
            >
              <div className="space-y-3">
                {operations.documents.map((doc) => (
                  <div
                    key={doc.name}
                    className="flex items-center gap-3 rounded-[10px] bg-[#F8FAFC] p-3"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#006FE6]">
                      <FileCheck2 size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{doc.name}</p>
                      <p className="text-xs text-[#667085]">{doc.detail}</p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === "documents" && <VehicleAttachments vehicle={vehicle}/>} 

      {tab === "bookings" && (
        <Panel title="Booking history">
          <div className="space-y-3">
            {vehicleBookings.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-[10px] border border-[#EAECF0] p-4 sm:flex-row sm:items-center"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#F4F3FF] text-[#5925DC]">
                  <CalendarPlus size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold">
                    {item.id} · {item.customer}
                  </p>
                  <p className="mt-1 text-xs text-[#667085]">{item.dates}</p>
                </div>
                <p className="text-sm font-bold">{formatPkr(item.amount)}</p>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </Panel>
      )}
      {tab === "expenses" && (
        <Panel title="Recent expenses">
          <div className="space-y-3">
            {vehicleExpenses.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 rounded-[10px] border border-[#EAECF0] p-4 sm:grid-cols-[110px_1fr_auto] sm:items-center"
              >
                <p className="text-xs text-[#667085]">{item.date}</p>
                <div>
                  <p className="text-sm font-semibold">{item.description}</p>
                  <p className="text-xs text-[#667085]">
                    {item.id} · {item.category}
                  </p>
                </div>
                <p className="text-sm font-bold">{formatPkr(item.amount)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {tab === "maintenance" && (
        <Panel title="Maintenance schedule">
          <div className="space-y-3">
            {vehicleMaintenance.map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-[10px] border border-[#EAECF0] p-4"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#FFFAEB] text-[#B54708]">
                  <Wrench size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-[#667085]">
                    {item.date} · {item.detail}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </Panel>
      )}
      {tab === "activity" && (
        <Panel title="Operational timeline">
          <Timeline
            items={[
              ...statusEvents.map((event) => ({
                id: event.id,
                title: `${event.from} → ${event.to}`,
                detail: `${event.reason}${event.notes ? ` · ${event.notes}` : ""} · ${event.actor}`,
                time: new Intl.DateTimeFormat("en-PK", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.effectiveAt)),
                icon: <Repeat2 size={16} />,
              })),
              ...vehicleActivity.map((item, index) => ({
                id: `activity-${index}`,
                ...item,
                icon:
                  index === 0 ? (
                    <ShieldCheck size={16} />
                  ) : (
                    <UserRound size={16} />
                  ),
              })),
            ]}
          />
        </Panel>
      )}
      {editing && (
        <VehicleDialog
          open
          onOpenChange={setEditing}
          vehicle={vehicle}
          onSave={save}
        />
      )}
      {changingStatus && (
        <StatusTransitionDialog
          open
          vehicle={vehicle}
          onOpenChange={setChangingStatus}
          onConfirm={changeStatus}
        />
      )}
      {operation && (
        <VehicleOperationDialog
          mode={operation}
          vehicle={vehicle}
          open
          onOpenChange={(next) => !next && setOperation(undefined)}
          onComplete={completeOperation}
        />
      )}
    </div>
  );
}

type StoredVehicleFile = { id:string; originalName:string; mimeType:string; size:number; classification:"vehicle_photo"|"vehicle_document"; createdAt:string; downloadUrl:string };

function VehicleAttachments({vehicle}:{vehicle:Vehicle}) {
  const [files,setFiles]=useState<StoredVehicleFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{let active=true;void fetch(`/api/v1/files?vehicleId=${encodeURIComponent(vehicle.id)}`,{cache:"no-store"}).then(async response=>{const payload=await response.json() as {data?:StoredVehicleFile[];error?:{message:string}};if(!active)return;if(response.ok)setFiles(payload.data??[]);else setMessage(payload.error?.message??"Unable to load attachments.");setLoading(false)}).catch(()=>{if(active){setMessage("Unable to load attachments.");setLoading(false)}});return()=>{active=false}},[vehicle.id]);

  async function upload(file:File|undefined,classification:StoredVehicleFile["classification"]) {
    if(!file||uploading)return;
    setUploading(true);setMessage("");
    const form=new FormData();form.set("vehicleId",vehicle.id);form.set("classification",classification);form.set("file",file);
    try {const response=await fetch("/api/v1/files",{method:"POST",body:form});const payload=await response.json() as {data?:StoredVehicleFile;error?:{message:string}};if(!response.ok||!payload.data)setMessage(payload.error?.message??"Upload failed.");else{setFiles(current=>[payload.data!,...current]);setMessage(`${payload.data.originalName} uploaded securely.`)}} catch {setMessage("Upload failed. Check the connection and try again.")} finally {setUploading(false)}
  }

  const photos=files.filter(file=>file.classification==="vehicle_photo");
  const documents=files.filter(file=>file.classification==="vehicle_document");
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
    <Panel title="Vehicle media" action={<label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm font-semibold ${uploading?"pointer-events-none opacity-50":"hover:bg-[#F8FAFC]"}`}><Camera size={16}/>Add photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={event=>void upload(event.target.files?.[0],"vehicle_photo")}/></label>}>
      {photos.length?<div className="grid grid-cols-2 gap-3">{photos.map((file,index)=><a key={file.id} href={file.downloadUrl} target="_blank" rel="noreferrer" className={`group relative overflow-hidden rounded-[10px] border bg-[#101828] ${index===0?"col-span-2 aspect-[16/9]":"aspect-[4/3]"}`}><Image src={file.downloadUrl} alt={`${vehicle.make} ${vehicle.model} — ${file.originalName}`} fill unoptimized className="object-cover transition group-hover:scale-[1.02]"/><span className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs text-white">{file.originalName}</span></a>)}</div>:<div className="grid aspect-[16/10] place-items-center rounded-[10px] border border-dashed border-[#D0D5DD] bg-[#F8FAFC] text-center text-sm text-[#667085]"><span><Camera className="mx-auto mb-2"/>No vehicle photos uploaded yet.</span></div>}
      <p className="mt-3 text-xs text-[#667085]">JPG, PNG, or WebP · up to 8 MB each · {photos.length} uploaded</p>
    </Panel>
    <Panel title="Document register" action={<label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] bg-[#006FE6] px-3 text-sm font-semibold text-white ${uploading?"pointer-events-none opacity-50":"hover:bg-[#005FC4]"}`}><Plus size={16}/>Add document<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={event=>void upload(event.target.files?.[0],"vehicle_document")}/></label>}>
      {message&&<p role="status" className={`mb-4 rounded-lg p-3 text-sm ${message.includes("uploaded securely")?"bg-[#ECFDF3] text-[#067647]":"bg-[#FEF3F2] text-[#B42318]"}`}>{message}</p>}
      {loading?<LoadingState rows={3}/>:documents.length?<div className="space-y-3">{documents.map(file=><a key={file.id} href={file.downloadUrl} className="flex items-center gap-3 rounded-[10px] border border-[#EAECF0] p-4 hover:border-[#84CAFF] hover:bg-[#FAFCFF]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><FileText size={19}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{file.originalName}</strong><span className="mt-1 block text-xs text-[#667085]">{file.mimeType} · {(file.size/1024).toFixed(0)} KB · {new Intl.DateTimeFormat("en-PK",{dateStyle:"medium"}).format(new Date(file.createdAt))}</span></span><StatusBadge status="Ready"/></a>)}</div>:<div className="rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]"><FileText className="mx-auto mb-2"/>No documents uploaded yet.</div>}
      <p className="mt-4 text-xs leading-5 text-[#667085]">Attachments are stored outside SQLite, remain private to the signed-in agency, and download through an authorized route.</p>
    </Panel>
  </div>;
}
