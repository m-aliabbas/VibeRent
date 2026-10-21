"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarPlus,
  Camera,
  CarFront,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { createAvailabilityBlockAction } from "@/app/actions/bookings";
import { getExpenseWorkspaceAction } from "@/app/actions/expenses";
import { getVehicleFinanceAction, setVehicleArchivedAction, transitionVehicleStatusAction } from "@/app/actions/vehicles";
import {
  AvailabilityCalendar,
  type CalendarSelection,
} from "@/components/bookings/availability-calendar";
import { ExpenseDialog } from "@/components/expenses/expense-dialog";
import { FormInput } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { Toast } from "@/components/shared/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
  vehicleOperationalData,
  vehicleStatusHistory,
  type VehicleDetailTab,
  type VehicleStatusEvent,
} from "@/lib/vehicle-detail-data";
import { formatPkr } from "@/lib/utils";
import { OilChangeBadge, OilChangePanel } from "@/components/vehicles/oil-change-panel";
import { needsOilChange } from "@/lib/oil-change";
import { downloadFromUrl } from "@/lib/download";
import type { ExpenseDto, ExpenseWorkspaceData } from "@/server/services/expense-service";
import type { VehicleFinanceSummary } from "@/server/services/vehicle-service";
import type { Vehicle } from "@/types/vehicle";

const tabs: { id: VehicleDetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "calendar", label: "Calendar" },
  { id: "income", label: "Rents & income" },
  { id: "expenses", label: "Expenses" },
  { id: "documents", label: "Documents & media" },
  { id: "maintenance", label: "Maintenance" },
  { id: "activity", label: "Activity" },
];

export function VehicleWorkspace({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusEvents, setStatusEvents] = useState<VehicleStatusEvent[]>(
    () => vehicleStatusHistory[vehicleId] ?? [],
  );
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [operation, setOperation] = useState<VehicleOperation>();
  const [tab, setTab] = useState<VehicleDetailTab>("overview");
  const [finance, setFinance] = useState<VehicleFinanceSummary>();
  const [expenseData, setExpenseData] = useState<ExpenseWorkspaceData>();
  const [addingExpense, setAddingExpense] = useState(false);
  const [calendarSelection, setCalendarSelection] = useState<CalendarSelection>();

  const load = async () => {
    setLoading(true);
    setError("");
    const [result, financeResult, expenseResult] = await Promise.all([
      vehicleRepository.getById(vehicleId),
      getVehicleFinanceAction(vehicleId),
      getExpenseWorkspaceAction(),
    ]);
    if (result.ok) setVehicle(result.data);
    else setError(result.error.message);
    if (financeResult.ok) setFinance(financeResult.data);
    if (expenseResult.ok) setExpenseData(expenseResult.data);
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    void Promise.all([vehicleRepository.getById(vehicleId), getVehicleFinanceAction(vehicleId), getExpenseWorkspaceAction()]).then(([result, financeResult, expenseResult]) => {
      if (!active) return;
      if (result.ok) setVehicle(result.data);
      else setError(result.error.message);
      if (financeResult.ok) setFinance(financeResult.data);
      if (expenseResult.ok) setExpenseData(expenseResult.data);
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
    const result = await transitionVehicleStatusAction(vehicle.id, input);
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
  const periods = finance ?? {
    today: { income: 0, expenses: 0 },
    month: { income: 0, expenses: 0 },
    total: { income: 0, expenses: 0 },
    depositHeld: 0,
    bookingValue: 0,
    outstanding: 0,
    bookings: [],
    availabilityBlocks: [],
    recentTransactions: [],
    recentExpenses: [],
  };
  const recordExpense = (item: ExpenseDto) => {
    setFinance(current => current ? { ...current, recentExpenses: [item, ...current.recentExpenses] } : current);
    setAddingExpense(false);
    setTab("expenses");
    setNotice(`${item.id} submitted for approval and linked to ${vehicle.plate}.`);
  };
  const removeVehicle=async()=>{if(!vehicle)return;setDeletePending(true);const result=await setVehicleArchivedAction(vehicle.id,true);setDeletePending(false);if(result.ok){router.push("/vehicles");router.refresh()}else{setNotice(result.error.message);setDeleting(false)}};

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
              {needsOilChange(vehicle.oilChange) && <button type="button" onClick={() => setTab("maintenance")} className="rounded-full" aria-label="Open oil change details"><OilChangeBadge summary={vehicle.oilChange} /></button>}
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
          <Button variant="secondary" disabled={!expenseData} onClick={() => setAddingExpense(true)}>
            <Plus size={17} />
            Add expense
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
          <Button variant="danger" onClick={()=>setDeleting(true)}>
            <Trash2 size={17}/>
            Delete vehicle
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

      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete ${vehicle.plate}?`} description="The vehicle will leave active fleet views while its rental, expense, and audit history remains preserved. Active bookings must be cancelled or completed first." onConfirm={()=>void removeVehicle()} pending={deletePending} confirmLabel="Delete vehicle" pendingLabel="Deleting…"/>
      {tab === "overview" && (
        <div className="space-y-5">
          <section className="grid gap-3 md:grid-cols-2">
            {[
              {
                label: "Total income",
                month: formatPkr(periods.month.income),
                today: formatPkr(periods.today.income),
                lifetime: formatPkr(periods.total.income),
                icon: CircleDollarSign,
                iconClass: "bg-[#ECFDF3] text-[#067647]",
              },
              {
                label: "Total expenses",
                month: formatPkr(periods.month.expenses),
                today: formatPkr(periods.today.expenses),
                lifetime: formatPkr(periods.total.expenses),
                icon: Gauge,
                iconClass: "bg-[#FFF6ED] text-[#B54708]",
              },
            ].map(({ label, month, today, lifetime, icon: Icon, iconClass }) => (
              <button
                type="button"
                key={label}
                onClick={() => setTab(label === "Total income" ? "income" : "expenses")}
                className="rounded-xl border border-[#E8ECF2] bg-white p-4 text-left transition hover:border-[#84CAFF] hover:shadow-sm focus:outline-2 focus:outline-[#006FE6] sm:p-5"
              >
                <div className="flex items-center gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-[9px] ${iconClass}`}>
                    <Icon size={19} />
                  </span>
                  <p className="text-sm font-semibold text-[#344054]">{label}</p>
                </div>
                <p className="mt-5 text-2xl font-bold tabular-nums text-[#19191F]">{month}</p>
                <p className="mt-1 text-xs font-medium text-[#667085]">This month</p>
                <div className="mt-4 grid grid-cols-2 divide-x divide-[#EAECF0] border-t border-[#EAECF0] pt-4">
                  <div className="pr-3">
                    <p className="text-sm font-bold tabular-nums text-[#344054]">{today}</p>
                    <p className="mt-1 text-xs text-[#667085]">Today</p>
                  </div>
                  <div className="pl-4">
                    <p className="text-sm font-bold tabular-nums text-[#344054]">{lifetime}</p>
                    <p className="mt-1 text-xs text-[#667085]">All time</p>
                  </div>
                </div>
                <span className="mt-4 inline-flex text-xs font-semibold text-[#006FE6]">View details →</span>
              </button>
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
            <Panel title="Latest rent collections" action={<button type="button" onClick={() => setTab("income")} className="text-xs font-semibold text-[#006FE6]">View ledger</button>}>
              {periods.recentTransactions.length ? <div className="space-y-3">{periods.recentTransactions.slice(0,3).map(item => <TransactionRow key={item.id} item={item}/>)}</div> : <p className="py-5 text-center text-sm text-[#667085]">No rent payments have been recorded for this vehicle.</p>}
            </Panel>
            <Panel title="Latest expenses" action={<button type="button" onClick={() => setTab("expenses")} className="text-xs font-semibold text-[#006FE6]">View expenses</button>}>
              {periods.recentExpenses.length ? <div className="space-y-3">{periods.recentExpenses.slice(0,3).map(item => <div key={item.id} className="flex items-center gap-3 rounded-[10px] bg-[#F8FAFC] p-3"><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.description}</strong><span className="mt-1 block text-xs text-[#667085]">{item.category} · {formatShortDate(item.occurredOn)}</span></span><strong className="text-sm">{formatPkr(item.amount)}</strong></div>)}</div> : <p className="py-5 text-center text-sm text-[#667085]">No expenses linked to this vehicle.</p>}
            </Panel>
          </div>
        </div>
      )}

      {tab === "documents" && <VehicleAttachments vehicle={vehicle}/>} 

      {tab === "calendar" && (
        <AvailabilityCalendar
          bookings={periods.bookings}
          vehicles={[vehicle]}
          blocks={periods.availabilityBlocks}
          onCreateBlock={setCalendarSelection}
        />
      )}

      {tab === "income" && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["Booking value", formatPkr(periods.bookingValue), "Confirmed and completed rent"],
              ["Rent collected", formatPkr(periods.total.income), "Posted rental income"],
              ["Security held", formatPkr(periods.depositHeld), "Refundable customer deposits"],
              ["Outstanding", formatPkr(periods.outstanding), "Open rental balances"],
            ].map(([label,value,note]) => <div key={label} className="rounded-xl border border-[#E8ECF2] bg-white p-4"><p className="text-xs text-[#667085]">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-[#667085]">{note}</p></div>)}
          </section>
          <Panel title="Rent and advance by booking" action={<Button asChild size="sm"><Link href="/bookings/new"><Plus size={16}/>New booking</Link></Button>}>
          <div className="space-y-3">
            {periods.bookings.map((item) => {
              const total = item.dailyRate * item.days + item.mileageRate * item.estimatedKm + item.extras - item.discount;
              return <Link
                key={item.id}
                href={`/bookings/${item.id}`}
                className="grid gap-3 rounded-[10px] border border-[#EAECF0] p-4 hover:border-[#84CAFF] hover:bg-[#FAFCFF] md:grid-cols-[auto_1fr_repeat(3,auto)_auto] md:items-center"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#F4F3FF] text-[#5925DC]">
                  <CalendarPlus size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold">{item.id} · {item.customer}</p>
                  <p className="mt-1 text-xs text-[#667085]">{formatShortDate(item.pickupAt)} – {formatShortDate(item.returnAt)}</p>
                </div>
                <FinanceFact label="Rent" value={formatPkr(total)}/>
                <FinanceFact label="Paid / advance" value={formatPkr(item.paid)}/>
                <FinanceFact label="Security held" value={formatPkr(item.depositHeld ?? 0)}/>
                <StatusBadge status={item.status} />
              </Link>;
            })}
            {!periods.bookings.length && <div className="rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]">No rents have been created for this vehicle yet.</div>}
          </div>
          </Panel>
          <Panel title="Payment and deposit ledger">
            <p className="mb-4 text-xs leading-5 text-[#667085]">Rent payments count as income immediately. Security deposits are tracked separately until they are applied, refunded, or forfeited.</p>
            <div className="space-y-3">{periods.recentTransactions.map(item => <TransactionRow key={item.id} item={item}/>)}{!periods.recentTransactions.length && <div className="rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]">No payments or deposits recorded yet.</div>}</div>
          </Panel>
        </div>
      )}
      {tab === "expenses" && (
        <Panel title="Recent expenses" action={<Button size="sm" disabled={!expenseData} onClick={() => setAddingExpense(true)}><Plus size={16} />Add expense</Button>}>
          <p className="mb-4 text-xs leading-5 text-[#667085]">Every record belongs to the agency. Approved records count in the totals above; submitted records remain visible while awaiting approval.</p>
          <div className="space-y-3">
            {periods.recentExpenses.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 rounded-[10px] border border-[#EAECF0] p-4 sm:grid-cols-[110px_1fr_auto_auto] sm:items-center"
              >
                <p className="text-xs text-[#667085]">{item.occurredOn}</p>
                <div>
                  <p className="text-sm font-semibold">{item.description}</p>
                  <p className="text-xs text-[#667085]">
                    {item.id} · {item.category}{item.customer ? ` · ${item.customer}` : ""}
                  </p>
                </div>
                <p className="text-sm font-bold">{formatPkr(item.amount)}</p>
                <StatusBadge status={item.status.replaceAll("_", " ")} />
              </div>
            ))}
            {!periods.recentExpenses.length && <div className="rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]">No expenses have been linked to this vehicle yet.</div>}
          </div>
        </Panel>
      )}
      {tab === "maintenance" && (
        <OilChangePanel
          vehicleId={vehicle.id}
          vehicleLabel={`${vehicle.make} ${vehicle.model} · ${vehicle.plate}`}
          archived={vehicle.status === "Archived"}
          onChanged={(summary, message) => {
            setVehicle((current) => (current ? { ...current, oilChange: summary } : current));
            setNotice(message);
          }}
        />
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
      {addingExpense && expenseData && (
        <ExpenseDialog
          data={expenseData}
          initialVehicleId={vehicle.id}
          onClose={() => setAddingExpense(false)}
          onSave={recordExpense}
        />
      )}
      {calendarSelection && (
        <VehicleBlockDialog
          selection={calendarSelection}
          vehicle={vehicle}
          onClose={() => setCalendarSelection(undefined)}
          onSaved={(block) => {
            setFinance(current => current ? { ...current, availabilityBlocks: [...current.availabilityBlocks, block] } : current);
            setCalendarSelection(undefined);
            setNotice("Availability block saved.");
          }}
        />
      )}
    </div>
  );
}

function FinanceFact({label,value}:{label:string;value:string}) {
  return <span><span className="block text-[10px] font-medium uppercase tracking-wide text-[#98A2B3]">{label}</span><strong className="mt-1 block whitespace-nowrap text-xs tabular-nums text-[#344054]">{value}</strong></span>;
}

function TransactionRow({item}:{item:VehicleFinanceSummary["recentTransactions"][number]}) {
  const negative = ["refund","reversal","deposit_refunded"].includes(item.kind.toLowerCase());
  return <Link href={`/bookings/${item.bookingId}`} className="grid gap-2 rounded-[10px] border border-[#EAECF0] p-3 hover:border-[#84CAFF] hover:bg-[#FAFCFF] sm:grid-cols-[1fr_auto] sm:items-center"><span className="min-w-0"><strong className="block truncate text-sm capitalize">{item.kind.replaceAll("_"," ")} · {item.customer}</strong><span className="mt-1 block truncate text-xs text-[#667085]">{item.bookingId} · {item.method} · {item.reference} · {formatShortDate(item.postedAt)}</span></span><span className="flex items-center gap-2"><StatusBadge status={item.status}/><strong className={`text-sm tabular-nums ${negative?"text-[#B42318]":"text-[#067647]"}`}>{negative?"−":"+"}{formatPkr(item.amount)}</strong></span></Link>;
}

function VehicleBlockDialog({selection,vehicle,onClose,onSaved}:{selection:CalendarSelection;vehicle:Vehicle;onClose:()=>void;onSaved:(block:VehicleFinanceSummary["availabilityBlocks"][number])=>void}) {
  const [from,setFrom]=useState(() => toLocalInput(selection.date,9));
  const [to,setTo]=useState(() => toLocalInput(selection.date,18));
  const [reason,setReason]=useState("");
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent) {
    event.preventDefault();
    setPending(true);setError("");
    const result=await createAvailabilityBlockAction({vehicleId:vehicle.id,from,to,reason});
    setPending(false);
    if(result.ok)onSaved(result.data);else setError(result.error.message);
  }
  return <Dialog.Root open onOpenChange={open=>!open&&onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between gap-3"><div><Dialog.Title className="font-bold">Block {vehicle.plate}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Reserve time for maintenance or another operational hold.</Dialog.Description></div><Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 place-items-center rounded-lg"><X/></Dialog.Close></div><form onSubmit={submit} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><FormInput label="From" type="datetime-local" value={from} onChange={event=>setFrom(event.target.value)} required/><FormInput label="To" type="datetime-local" value={to} onChange={event=>setTo(event.target.value)} required/></div><FormInput label="Reason" value={reason} onChange={event=>setReason(event.target.value)} placeholder="e.g. Scheduled service" required/>{error&&<div role="alert" className="rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]"><ShieldAlert size={16} className="mr-2 inline"/>{error}</div>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={pending||!reason.trim()||!from||!to}>{pending?"Saving…":"Create block"}</Button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function formatShortDate(value:string){return new Intl.DateTimeFormat("en-PK",{day:"2-digit",month:"short",year:"numeric",hour:value.includes("T")?"numeric":undefined,minute:value.includes("T")?"2-digit":undefined}).format(new Date(value))}
function toLocalInput(value:Date,hour:number){const date=new Date(value);date.setHours(hour,0,0,0);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)}

type StoredVehicleFile = { id:string; originalName:string; mimeType:string; size:number; classification:"vehicle_photo"|"vehicle_document"; createdAt:string; downloadUrl:string };

function VehicleAttachments({vehicle}:{vehicle:Vehicle}) {
  const [files,setFiles]=useState<StoredVehicleFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState("");
  const [downloading,setDownloading]=useState<string>();

  useEffect(()=>{let active=true;void fetch(`/api/v1/files?vehicleId=${encodeURIComponent(vehicle.id)}`,{cache:"no-store"}).then(async response=>{const payload=await response.json() as {data?:StoredVehicleFile[];error?:{message:string}};if(!active)return;if(response.ok)setFiles(payload.data??[]);else setMessage(payload.error?.message??"Unable to load attachments.");setLoading(false)}).catch(()=>{if(active){setMessage("Unable to load attachments.");setLoading(false)}});return()=>{active=false}},[vehicle.id]);

  async function upload(file:File|undefined,classification:StoredVehicleFile["classification"]) {
    if(!file||uploading)return;
    setUploading(true);setMessage("");
    const form=new FormData();form.set("vehicleId",vehicle.id);form.set("classification",classification);form.set("file",file);
    try {const response=await fetch("/api/v1/files",{method:"POST",body:form});const payload=await response.json() as {data?:StoredVehicleFile;error?:{message:string}};if(!response.ok||!payload.data)setMessage(payload.error?.message??"Upload failed.");else{setFiles(current=>[payload.data!,...current]);setMessage(`${payload.data.originalName} uploaded securely.`)}} catch {setMessage("Upload failed. Check the connection and try again.")} finally {setUploading(false)}
  }
  async function download(file:StoredVehicleFile) {
    setDownloading(file.id);setMessage("");
    try {const result=await downloadFromUrl(file.downloadUrl,file.originalName);setMessage(result.path?`${file.originalName} saved to ${result.path}`:`${file.originalName} downloaded.`)}
    catch(error){setMessage(error instanceof Error?error.message:"Download failed.")}
    finally{setDownloading(undefined)}
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
      {loading?<LoadingState rows={3}/>:documents.length?<div className="space-y-3">{documents.map(file=><button type="button" disabled={Boolean(downloading)} onClick={()=>void download(file)} key={file.id} className="flex w-full items-center gap-3 rounded-[10px] border border-[#EAECF0] p-4 text-left hover:border-[#84CAFF] hover:bg-[#FAFCFF] disabled:opacity-60"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><FileText size={19}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{file.originalName}</strong><span className="mt-1 block text-xs text-[#667085]">{file.mimeType} · {(file.size/1024).toFixed(0)} KB · {new Intl.DateTimeFormat("en-PK",{dateStyle:"medium"}).format(new Date(file.createdAt))}</span></span><StatusBadge status={downloading===file.id?"Saving":"Ready"}/></button>)}</div>:<div className="rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]"><FileText className="mx-auto mb-2"/>No documents uploaded yet.</div>}
      <p className="mt-4 text-xs leading-5 text-[#667085]">Attachments are stored outside SQLite, remain private to the signed-in agency, and download through an authorized route.</p>
    </Panel>
  </div>;
}
