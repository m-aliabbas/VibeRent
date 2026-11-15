"use client";

import { useEffect, useMemo, useState } from "react";
import { CarFront, Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormMultiSelect } from "@/components/forms/form-multi-select";
import { PageHeader } from "@/components/shared/page-header";
import { Toast } from "@/components/shared/toast";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPkr } from "@/lib/utils";
import { downloadFromUrl, saveBlob } from "@/lib/download";
import {
  buildLedgerEntries,
  filterLedgerEntries,
  ledgerOpeningResult,
  ownerLedgerByCar,
  runningResultBalances,
  summarizeLedger,
} from "@/lib/reports/ledger";
import type { LedgerEntry, LedgerEntryType, LedgerScope } from "@/lib/reports/ledger";
import { OwnerCarSheet } from "@/components/reports/owner-car-sheet";
import { agencyOpeningBalance, filterAgencyEntries, summarizeAgencyAccount } from "@/lib/reports/agency-account";
import type { AgencyAccountEntry } from "@/lib/reports/agency-account";
import type { ReportsData, ReportSource, VehicleReportRow } from "@/server/services/report-service";

type Tab = "Ledger" | "Agency account" | "Vehicle P&L" | "Revenue & collections" | "Utilization" | "Expenses" | "Owners";
// Expenses and Owners live in Money summary (Show: Expenses) and on the Owners page; no duplicate tabs.
const tabs: Tab[] = ["Ledger", "Agency account", "Vehicle P&L", "Revenue & collections", "Utilization"];
const tabLabels: Record<Tab, string> = { "Ledger": "Money summary", "Agency account": "Agency account", "Vehicle P&L": "Per car", "Revenue & collections": "Collections", "Utilization": "Car usage", "Expenses": "Expenses", "Owners": "Owners" };
const ledgerEntryTypes: { value: LedgerEntryType; label: string }[] = [
  { value: "all", label: "All entries" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "owner-payment", label: "Owner & source payments" },
];

export function ReportsWorkspace({ data }: { data: ReportsData }) {
  const defaultTo = data.dateBounds.max;
  const [tab, setTab] = useState<Tab>("Ledger");
  const [periodKey, setPeriod] = useState(data.periods[0]?.key ?? "");
  const [from, setFrom] = useState(`${defaultTo.slice(0, 7)}-01`);
  const [to, setTo] = useState(defaultTo);
  const [city, setCity] = useState("All cities");
  const [ownership, setOwnership] = useState("All ownership");
  const [scopeType, setScopeType] = useState<LedgerScope["type"]>("overall");
  const [ownerId, setOwnerId] = useState(data.ledgerAccounts.owners[0]?.id ?? "");
  const [vehicleOwnerIds, setVehicleOwnerIds] = useState<string[]>([]);
  const [vehicleIds, setVehicleIds] = useState<string[]>(data.ledgerAccounts.vehicles.filter((item) => !item.archived).map((item) => item.id));
  const [entryType, setEntryType] = useState<LedgerEntryType>("all");
  const [expenseHead, setExpenseHead] = useState("");
  const [drill, setDrill] = useState<{ title: string; sources: ReportSource[] }>();
  const [notice, setNotice] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("tab");
    const requestedEntry = params.get("entry");
    queueMicrotask(() => {
      if (tabs.includes(value as Tab)) setTab(value as Tab);
      if (value === "Expenses") setEntryType("expense");
      if (value === "Owners") window.location.replace("/owners");
      if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("from") ?? "")) setFrom(params.get("from")!);
      if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("to") ?? "")) setTo(params.get("to")!);
      if (ledgerEntryTypes.some((item) => item.value === requestedEntry)) setEntryType(requestedEntry as LedgerEntryType);
      if (requestedEntry === "expense" && data.ledgerAccounts.expenseHeads.includes(params.get("head") ?? "")) setExpenseHead(params.get("head")!);
      const requestedOwner = params.get("ownerId");
      if (params.get("scope") === "owner" && data.ledgerAccounts.owners.some((item) => item.id === requestedOwner)) {
        setScopeType("owner");
        setOwnerId(requestedOwner!);
        if (!params.has("from")) setFrom(data.dateBounds.min);
      }
    });
  }, [data.dateBounds.min, data.ledgerAccounts.owners, data.ledgerAccounts.expenseHeads]);
  const period = data.periods.find((item) => item.key === periodKey) ?? data.periods[0];
  const filtered = useMemo(
    () =>
      period?.vehicles.filter((row) => (city === "All cities" || row.city === city) && (ownership === "All ownership" || row.ownership === ownership)) ?? [],
    [period, city, ownership],
  );
  const ownerNames = useMemo(() => new Map(data.ledgerAccounts.owners.map((item) => [item.id, item.label])), [data.ledgerAccounts.owners]);
  const baseAvailableVehicles = useMemo(
    () =>
      data.ledgerAccounts.vehicles.filter(
        (item) => (city === "All cities" || item.city === city) && (ownership === "All ownership" || item.ownership === ownership),
      ),
    [data.ledgerAccounts.vehicles, city, ownership],
  );
  const availableVehicles = useMemo(
    () => baseAvailableVehicles.filter((item) => !vehicleOwnerIds.length || (item.ownerId && vehicleOwnerIds.includes(item.ownerId))),
    [baseAvailableVehicles, vehicleOwnerIds],
  );
  const ownerVehicleOptions = useMemo(
    () =>
      data.ledgerAccounts.owners.map((item) => {
        const count = baseAvailableVehicles.filter((vehicle) => vehicle.ownerId === item.id && !vehicle.archived).length;
        return { value: item.id, label: item.label, description: `${count} matching ${count === 1 ? "vehicle" : "vehicles"}`, disabled: count === 0 };
      }),
    [data.ledgerAccounts.owners, baseAvailableVehicles],
  );
  const selectedVehicleIds = useMemo(() => vehicleIds.filter((id) => availableVehicles.some((item) => item.id === id)), [vehicleIds, availableVehicles]);
  const scope = useMemo<LedgerScope>(
    () =>
      scopeType === "owner"
        ? { type: "owner", ownerId }
        : scopeType === "vehicles"
          ? { type: "vehicles", vehicleIds: selectedVehicleIds }
          : { type: "overall" },
    [scopeType, ownerId, selectedVehicleIds],
  );
  const rangeValid = Boolean(from && to && from <= to);
  const activeHead = entryType === "expense" ? expenseHead : "";
  const ledgerEntries = useMemo(() => {
    const rows = rangeValid ? buildLedgerEntries(data.ledgerEntries, { from, to, city, ownership, scope }) : [];
    return filterLedgerEntries(rows, entryType, scopeType === "owner", activeHead);
  }, [data.ledgerEntries, from, to, city, ownership, scope, scopeType, rangeValid, entryType, activeHead]);
  const openingResult = useMemo(
    () => (rangeValid && entryType === "all" ? ledgerOpeningResult(data.ledgerEntries, { from, to, city, ownership, scope }) : 0),
    [data.ledgerEntries, from, to, city, ownership, scope, rangeValid, entryType],
  );
  const owner = data.ledgerAccounts.owners.find((item) => item.id === ownerId);
  const oneVehicle = selectedVehicleIds.length === 1 ? data.ledgerAccounts.vehicles.find((item) => item.id === selectedVehicleIds[0]) : undefined;
  const baseLedgerTitle =
    scopeType === "owner"
      ? `Owner ledger · ${owner?.label ?? "Select owner"}`
      : scopeType === "vehicles"
        ? oneVehicle
          ? `Vehicle ledger · ${oneVehicle.label}`
          : `Vehicle ledger · ${selectedVehicleIds.length} vehicles`
        : "Whole-system ledger";
  const entryTypeLabel = ledgerEntryTypes.find((item) => item.value === entryType)?.label ?? "All entries";
  const ledgerTitle = activeHead
    ? `${activeHead} expenses · ${baseLedgerTitle}`
    : entryType === "all"
      ? baseLedgerTitle
      : `${entryTypeLabel} · ${baseLedgerTitle}`;
  const rangeLabel = rangeValid ? `${formatDate(from)} – ${formatDate(to)}` : "Choose a valid date range";
  const balances = useMemo(() => runningResultBalances(ledgerEntries, openingResult), [ledgerEntries, openingResult]);
  const agencyEntries = useMemo(() => (rangeValid ? filterAgencyEntries(data.agencyEntries, from, to, city) : []), [data.agencyEntries, from, to, city, rangeValid]);
  const agencyOpening = useMemo(() => (rangeValid ? agencyOpeningBalance(data.agencyEntries, from, city) : 0), [data.agencyEntries, from, city, rangeValid]);
  async function exportCsv() {
    if (!period) return;
    const content =
      tab === "Agency account"
        ? (() => {
            let balance = agencyOpening;
            return [
              "date,source,vehicle,customer,reference,description,gross,agency_amount,balance",
              ["", "Opening balance", "", "", "", "", "", "", agencyOpening].map(csv).join(","),
              ...agencyEntries.map((row) => [row.date, row.source, row.vehicle, row.customer ?? "", row.reference, row.description, row.gross, row.amount, (balance += row.amount)].map(csv).join(",")),
            ].join("\n");
          })()
        : tab === "Ledger" && scopeType === "owner"
        ? [
            "car_number,date,customer,description,entry,expense_head,days,rent,owner_share,cash_out,meter,remaining,reference",
            ...ownerLedgerByCar(ledgerEntries).flatMap((car) =>
              car.rows.map((row) =>
                [row.plate, row.date, row.customer ?? "", row.kind === "Rental share" ? row.destination ?? "" : row.description, row.kind, row.head ?? "", row.days || "", row.rent || "", row.income || "", row.expense + row.paid || "", row.meter ?? "", row.balance, row.reference]
                  .map(csv)
                  .join(","),
              ),
            ),
          ].join("\n")
        : tab === "Ledger"
          ? [
              "date,vehicle,owner,entry,expense_head,reference,description,income,expense,owner_movement,operating_result,balance",
              ...(openingResult ? [["", "Opening balance", "", "", "", "", "", "", "", "", "", openingResult].map(csv).join(",")] : []),
              ...ledgerEntries.map((row) =>
                [
                  row.date,
                  row.vehicle,
                  row.owner ?? "",
                  row.kind,
                  row.category ?? "",
                  row.reference,
                  row.description,
                  row.income,
                  row.expense,
                  row.ownerMovement,
                  row.operatingResult,
                  balances.get(row.id) ?? 0,
                ]
                  .map(csv)
                  .join(","),
              ),
            ].join("\n")
          : [
              "vehicle,city,ownership,revenue,expenses,owner_share,utilization",
              ...filtered.map((row) => [row.vehicle, row.city, row.ownership, row.revenue, row.expenses, row.ownerShare, row.utilization].map(csv).join(",")),
            ].join("\n");
    const name = tab === "Agency account" ? `viberent-agency-account-${from}-to-${to}.csv` : tab === "Ledger" ? `viberent-ledger-${from}-to-${to}.csv` : `viberent-${period.key}-${tab.toLowerCase().replaceAll(" ", "-")}.csv`;
    try {
      const result = await saveBlob(new Blob([content], { type: "text/csv" }), name);
      setNotice(result.path ? `Report saved to ${result.path}` : "The filtered report was exported.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The report could not be exported.");
    }
  }
  async function exportPdf() {
    if (!rangeValid || pdfBusy || (scopeType === "owner" && !ownerId) || (scopeType === "vehicles" && !selectedVehicleIds.length)) return;
    setPdfBusy(true);
    try {
      const query = new URLSearchParams({ from, to, city, ownership, scope: scopeType, entry: entryType });
      if (activeHead) query.set("head", activeHead);
      if (scopeType === "owner") query.set("ownerId", ownerId);
      if (scopeType === "vehicles") selectedVehicleIds.forEach((id) => query.append("vehicleId", id));
      const result = await downloadFromUrl(`/api/v1/reports/ledger.pdf?${query}`, `viberent-${entryType}-ledger-${from}-to-${to}.pdf`);
      setNotice(result.path ? `PDF saved to ${result.path}` : "The ledger PDF was downloaded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The PDF could not be generated.");
    } finally {
      setPdfBusy(false);
    }
  }
  const [moreFilters, setMoreFilters] = useState(false);
  function setPreset(value: "day" | "month" | "year" | "all") {
    const end = data.dateBounds.max;
    setTo(end);
    setFrom(value === "day" ? end : value === "month" ? `${end.slice(0, 7)}-01` : value === "year" ? `${end.slice(0, 4)}-01-01` : data.dateBounds.min);
  }
  function changeOwnership(value: string) {
    setOwnership(value);
    if (value === "Owned") setVehicleOwnerIds([]);
  }
  function changeVehicleOwners(nextOwnerIds: string[]) {
    setVehicleOwnerIds(nextOwnerIds);
    if (nextOwnerIds.length)
      setVehicleIds((current) =>
        current.filter((id) => {
          const vehicle = data.ledgerAccounts.vehicles.find((item) => item.id === id);
          return Boolean(vehicle?.ownerId && nextOwnerIds.includes(vehicle.ownerId));
        }),
      );
  }
  function changeVisibleVehicles(nextVehicleIds: string[]) {
    setVehicleIds((current) => [...current.filter((id) => !availableVehicles.some((item) => item.id === id)), ...nextVehicleIds]);
  }
  const periodPicker = (
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-[#344054]">Period</span>
              <div className="flex flex-wrap items-center gap-1">
                {([["day", "Today"], ["month", "This month"], ["year", "This year"], ["all", "All time"]] as const).map(([key, label]) => {
                  const end = data.dateBounds.max;
                  const presetFrom = key === "day" ? end : key === "month" ? `${end.slice(0, 7)}-01` : key === "year" ? `${end.slice(0, 4)}-01-01` : data.dateBounds.min;
                  const active = from === presetFrom && to === end;
                  return <button key={key} type="button" aria-pressed={active} onClick={() => setPreset(key)} className={`h-9 rounded-[8px] border px-2.5 text-sm font-medium ${active ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : "border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]"}`}>{label}</button>;
                })}
                <input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054] tabular-nums" />
                <span className="text-[#667085]">–</span>
                <input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054] tabular-nums" />
              </div>
            </div>
  );
  if (!period) return <EmptyState title="No report data" description="Operational activity will populate reports automatically." />;
  return (
    <div className="space-y-6">
      <Toast message={notice} onDismiss={() => setNotice("")} />
      <div className="print-hidden">
        <PageHeader
          eyebrow="Performance"
          title="Reports"
          description="Whole-system, owner, and multi-vehicle ledgers for any date range."
          actions={
            <>
              <Button variant="secondary" onClick={exportCsv} disabled={(tab === "Ledger" || tab === "Agency account") && !rangeValid}>
                <Download size={16} />
                Export CSV
              </Button>
              {tab === "Ledger" && (
                <Button
                  onClick={exportPdf}
                  disabled={pdfBusy || !rangeValid || (scopeType === "owner" && !ownerId) || (scopeType === "vehicles" && !selectedVehicleIds.length)}
                >
                  <FileText size={16} />
                  {pdfBusy ? "Preparing PDF…" : "Download PDF"}
                </Button>
              )}
            </>
          }
        />
      </div>
      <div className="print-hidden flex gap-1 overflow-x-auto border-b border-[#E4E7EC]" role="tablist" aria-label="Report">
        {tabs.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setDrill(undefined); }} className={`-mb-px h-10 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === item ? "border-[#006FE6] text-[#0058B8]" : "border-transparent text-[#475467] hover:text-[#19191F]"}`}>{tabLabels[item]}</button>
        ))}
      </div>
      {tab === "Ledger" ? (
        <section className="print-hidden space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Show">
            <span className="mr-1 text-sm font-semibold text-[#344054]">Show</span>
            {ledgerEntryTypes.map((item) => <button key={item.value} type="button" role="radio" aria-checked={entryType === item.value} onClick={() => setEntryType(item.value)} className={`h-9 rounded-full border px-4 text-sm font-semibold ${entryType === item.value ? "border-[#006FE6] bg-[#006FE6] text-white" : "border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]"}`}>{item.label === "All entries" ? "Everything" : item.label}</button>)}
            {entryType === "expense" && <select aria-label="Expense type" value={expenseHead} onChange={(event) => setExpenseHead(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option value="">All expense types</option>{data.ledgerAccounts.expenseHeads.map((item) => <option key={item}>{item}</option>)}</select>}
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            {periodPicker}
            <div className="w-[320px]"><SegmentedControl label="Report for" value={scopeType} onChange={setScopeType} options={[{ label: "Business", value: "overall" }, { label: "Owner", value: "owner" }, { label: "Vehicles", value: "vehicles" }]} /></div>
            <button type="button" aria-expanded={moreFilters} onClick={() => setMoreFilters(value => !value)} className={`h-9 rounded-[8px] border px-3 text-sm font-semibold ${moreFilters || city !== "All cities" || ownership !== "All ownership" ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : "border-[#D0D5DD] bg-white text-[#344054]"}`}>More filters</button>
          </div>
          {moreFilters && <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-[10px] bg-[#F8FAFC] p-3">
            <label><span className="mb-1.5 block text-sm font-semibold text-[#344054]">City</span>
              <select value={city} onChange={(event) => setCity(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option>All cities</option>{data.cities.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label><span className="mb-1.5 block text-sm font-semibold text-[#344054]">Ownership</span>
              <select value={ownership} onChange={(event) => changeOwnership(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option>All ownership</option><option>Owned</option><option>Managed</option></select>
            </label>
          </div>}
          {!rangeValid && <p role="alert" className="rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]">The from date must be on or before the to date.</p>}
            {scopeType === "owner" && (
              <div className="max-w-lg">
                <FormCombobox
                  label="Owner"
                  value={ownerId}
                  onValueChange={setOwnerId}
                  placeholder="Choose an owner"
                  searchPlaceholder="Search owner…"
                  emptyText="No owners found"
                  options={data.ledgerAccounts.owners.map((item) => ({
                    value: item.id,
                    label: item.label,
                    keywords: data.ledgerAccounts.vehicles
                      .filter((vehicle) => vehicle.ownerId === item.id)
                      .map((vehicle) => vehicle.label)
                      .join(" "),
                  }))}
                />
              </div>
            )}
            {scopeType === "vehicles" && (
              <div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <FormMultiSelect
                    label="Filter by owner (optional)"
                    value={vehicleOwnerIds}
                    onValueChange={changeVehicleOwners}
                    options={ownerVehicleOptions}
                    placeholder={ownership === "Owned" ? "Owned vehicles have no external owner" : "All owners"}
                    searchPlaceholder="Search owner…"
                    emptyText="No owners match the current filters"
                    disabled={ownership === "Owned"}
                  />
                  <FormMultiSelect
                    label="Vehicles"
                    value={selectedVehicleIds}
                    onValueChange={changeVisibleVehicles}
                    options={availableVehicles.map((item) => ({
                      value: item.id,
                      label: item.label,
                      description: `${item.city} · ${item.ownership}${item.ownerId ? ` · ${ownerNames.get(item.ownerId) ?? "Owner"}` : ""}${item.archived ? " · Archived" : ""}`,
                      keywords: `${item.city} ${item.ownership} ${item.ownerId ? (ownerNames.get(item.ownerId) ?? "") : ""}`,
                    }))}
                    placeholder="Choose vehicles"
                    searchPlaceholder="Search make, model, plate or city…"
                    emptyText="No vehicles match the selected owner and report filters"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]">
                  <CarFront size={14} />
                  <span>
                    {selectedVehicleIds.length
                      ? `${selectedVehicleIds.length} ${selectedVehicleIds.length === 1 ? "vehicle" : "vehicles"} included in this report.`
                      : "Select at least one vehicle to generate the report."}
                  </span>
                  {vehicleOwnerIds.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Only vehicles linked to{" "}
                        {vehicleOwnerIds.length === 1
                          ? (ownerNames.get(vehicleOwnerIds[0]) ?? "the selected owner")
                          : `${vehicleOwnerIds.length} selected owners`}{" "}
                        are shown.
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
        </section>
      ) : tab === "Agency account" ? (
        <section className="print-hidden space-y-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            {periodPicker}
            <label><span className="mb-1.5 block text-sm font-semibold text-[#344054]">City</span>
              <select value={city} onChange={(event) => setCity(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option>All cities</option>{data.cities.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
          </div>
          {!rangeValid && <p role="alert" className="rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]">The from date must be on or before the to date.</p>}
        </section>
      ) : (
        <div className="print-hidden flex flex-wrap items-end gap-x-4 gap-y-3">
          <div><span className="mb-1.5 block text-sm font-semibold text-[#344054]">Month</span><div className="flex flex-wrap items-center gap-1">{data.periods.slice(0, 4).map((item) => <button key={item.key} type="button" aria-pressed={periodKey === item.key} onClick={() => setPeriod(item.key)} className={`h-9 rounded-[8px] border px-2.5 text-sm font-medium ${periodKey === item.key ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : "border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]"}`}>{item.label}</button>)}{data.periods.length > 4 && <select aria-label="Older months" value={data.periods.slice(0, 4).some((item) => item.key === periodKey) ? "" : periodKey} onChange={(event) => event.target.value && setPeriod(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option value="">Older…</option>{data.periods.slice(4).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}</div></div>
          <label><span className="mb-1.5 block text-sm font-semibold text-[#344054]">City</span><select value={city} onChange={(event) => setCity(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option>All cities</option>{data.cities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className="mb-1.5 block text-sm font-semibold text-[#344054]">Ownership</span><select value={ownership} onChange={(event) => changeOwnership(event.target.value)} className="h-9 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]"><option>All ownership</option><option>Owned</option><option>Managed</option></select></label>
        </div>
      )}
      <section className="print-surface space-y-6">
        <header className="hidden print:block">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#006FE6]">VibeRent report</p>
          <h1 className="mt-1 text-2xl font-bold">{tab === "Ledger" ? ledgerTitle : tab}</h1>
          <p className="mt-1 text-sm text-[#667085]">
            {tab === "Ledger" || tab === "Agency account" ? rangeLabel : period.label} · {city}{tab === "Agency account" ? "" : ` · ${ownership}`}
          </p>
        </header>
        {tab === "Ledger" && <LedgerReport
            entries={ledgerEntries}
            title={ledgerTitle}
            period={rangeLabel}
            ownerView={scopeType === "owner"}
            openingResult={openingResult}
            balances={balances}
            entryType={entryType}
          />}{" "}
        {tab === "Agency account" && <AgencyAccount entries={agencyEntries} opening={agencyOpening} period={rangeLabel} />}{" "}
        {tab === "Vehicle P&L" && <VehiclePnl rows={filtered} onDrill={setDrill} />}{" "}
        {tab === "Revenue & collections" && <Collections data={period.collections} />} {tab === "Utilization" && <Utilization rows={filtered} />}{" "}
        
        {drill && <DrillDown data={drill} onClose={() => setDrill(undefined)} />}
        {tab === "Ledger" && <p className="print-hidden text-xs text-[#475467]">Balances carry forward from before the start date. Rental income is dated by booking start; payments by their posted date.</p>}
      </section>
    </div>
  );
}

const agencySourceTone: Record<AgencyAccountEntry["source"], string> = {
  "Own car": "bg-[#EFF8FF] text-[#175CD3]",
  "Managed car": "bg-[#F4F3FF] text-[#5925DC]",
  "External car": "bg-[#ECFDF3] text-[#067647]",
  "Other income": "bg-[#FEF6EE] text-[#B93815]",
  "Agency expense": "bg-[#FEF3F2] text-[#B42318]",
  "Expense recovery": "bg-[#F2F4F7] text-[#344054]",
};
function withRunningBalance(entries: AgencyAccountEntry[], opening: number) {
  let balance = opening;
  return entries.map((row) => ({ row, balance: (balance += row.amount) }));
}
function AgencyAccount({ entries, opening, period }: { entries: AgencyAccountEntry[]; opening: number; period: string }) {
  const totals = summarizeAgencyAccount(entries);
  const closing = opening + totals.net;
  const rows = withRunningBalance(entries, opening);
  const signed = (value: number) => <span className={`font-semibold tabular-nums ${value < 0 ? "text-[#B42318]" : "text-[#067647]"}`}>{value > 0 ? "+" : ""}{formatPkr(value)}</span>;
  return (
    <>
      <div>
        <h2 className="text-lg font-bold">Agency account <span className="text-sm font-normal text-[#475467]">· {period}</span></h2>
        <p className="mt-1 text-sm text-[#475467]">Money the agency owns: own cars in full, the agency&apos;s cut of managed cars, commission on external cars and other income, less the agency&apos;s share of expenses.</p>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Metric label="Opening balance" value={formatPkr(opening)} note="Agency-owned before this range" />
        <Metric label="Own cars" value={formatPkr(totals.ownCars)} note="Full rental, completed trips" />
        <Metric label="Managed cars" value={formatPkr(totals.managedShare)} note="Agency share per agreement" />
        <Metric label="External cars" value={formatPkr(totals.externalCommission)} note="Commission after supplier" />
        <Metric label="Other income" value={formatPkr(totals.otherIncome)} note="External income entries" />
        <Metric label="Agency expenses" value={formatPkr(totals.expenses)} note="Owner-allocated costs excluded" />
        <Metric label="Closing balance" value={formatPkr(closing)} note={`Net this range ${formatPkr(totals.net)}`} />
      </section>
      {entries.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-white md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F2F4F7] text-[#344054]">
                <tr>{["Date", "Source", "Vehicle / details", "Gross", "Agency", "Balance"].map((h, i) => <th key={h} className={`px-3 py-2 font-semibold ${i >= 3 ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                <tr className="border-t bg-[#F8FAFC]"><td className="px-3 py-2 text-[#475467]" colSpan={5}>Opening balance</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPkr(opening)}</td></tr>
                {rows.map(({ row, balance }) => (
                  <tr key={row.id} className="border-t align-top even:bg-[#FAFBFC] hover:bg-[#EEF4FF]">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(row.date)}</td>
                    <td className="px-3 py-2"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${agencySourceTone[row.source]}`}>{row.source}</span></td>
                    <td className="px-3 py-2"><span className="font-semibold">{row.vehicle}</span>{row.customer && <span className="ml-2 text-xs text-[#475467]">{row.customer}</span>}<p className="text-xs text-[#475467]">{row.description}</p></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#475467]">{formatPkr(row.gross)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{signed(row.amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatPkr(balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map(({ row, balance }) => (
              <li key={row.id} className="rounded-xl border bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${agencySourceTone[row.source]}`}>{row.source}</span><p className="mt-1 font-semibold">{row.vehicle}</p><p className="text-xs text-[#475467]">{formatDate(row.date)}{row.customer ? ` · ${row.customer}` : ""}</p></div>
                  <div className="text-right">{signed(row.amount)}<p className="text-xs text-[#475467]">Bal {formatPkr(balance)}</p></div>
                </div>
                <p className="mt-2 text-xs text-[#475467]">{row.description}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState title="No agency activity in this range" description="Completed rentals, external income and agency expenses will appear here." />
      )}
      <p className="print-hidden text-xs text-[#475467]">Rentals count once completed and are dated by booking start. Cash held for owners and suppliers is not agency money and stays out of this account.</p>
    </>
  );
}

function csv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function LedgerReport({
  entries,
  title,
  period,
  ownerView,
  openingResult,
  balances, entryType = "all",
}: {
  entries: LedgerEntry[];
  title: string;
  period: string;
  ownerView: boolean;
  openingResult: number;
  balances: Map<string, number>;
  entryType?: LedgerEntryType;
}) {
  const totals = summarizeLedger(entries);
  const closing = entries.length ? (balances.get(entries.at(-1)!.id) ?? openingResult) : openingResult;
  return (
    <>
      <h2 className="text-lg font-bold">{title} <span className="text-sm font-normal text-[#475467]">· {period}</span></h2>
      {ownerView ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Opening balance" value={formatPkr(totals.openingOwnerBalance)} note="Brought forward" />
          <Metric label="Owner share earned" value={formatPkr(totals.ownerShare)} note="Owner allocation from rentals" />
          <Metric
            label="Owner's expenses"
            value={formatPkr(totals.ownerExpenses)}
            note={totals.fixedCharges ? `Includes ${formatPkr(totals.fixedCharges)} fixed charges` : "Owner allocation of approved costs"}
          />
          <Metric label="Paid to owner" value={formatPkr(totals.ownerSettlements)} note="Posted payouts" />
          <Metric label="Closing balance" value={formatPkr(totals.closingOwnerBalance)} note="Payable to owner" />
        </section>
      ) : entryType === "expense" ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Total expenses" value={formatPkr(totals.expenses)} note={`${entries.length} entries`} />
          {totals.recovered ? <Metric label="Recovered" value={formatPkr(totals.recovered)} note="Paid back by others" /> : null}
          {totals.ownerExpenses ? <Metric label="Charged to owners" value={formatPkr(totals.ownerExpenses)} note="Owner share of costs" /> : null}
        </section>
      ) : entryType === "income" ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Total income" value={formatPkr(totals.income)} note={`${entries.length} payments`} />
        </section>
      ) : entryType === "owner-payment" ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Paid to owners & sources" value={formatPkr(totals.ownerSettlements)} note={`${entries.length} entries`} />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Opening balance" value={formatPkr(openingResult)} note="Net result before this range" />
          <Metric label="Posted income" value={formatPkr(totals.income)} note="Payments net of reversals" />
          <Metric label="Net expenses" value={formatPkr(totals.expenses)} note={totals.recovered ? `After ${formatPkr(totals.recovered)} recovered` : `${formatPkr(totals.ownerExpenses)} owner-allocated`} />
          <Metric label="Owner & source payments" value={formatPkr(totals.ownerSettlements)} note="Posted payout ledger" />
          <Metric label="Closing balance" value={formatPkr(closing)} note="Opening + income − expenses − payouts" />
        </section>
      )}
      {ownerView ? (
        <OwnerLedgerTable entries={entries} period={period} />
      ) : entries.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-white md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F2F4F7] text-[13px] text-[#344054]">
                <tr>
                  {["Date", "Vehicle / owner", "Entry", "Income", "Expense", "Owner", "Balance"].map((item) => (
                    <th key={item} className={`px-3 py-2 font-semibold ${["Income","Expense","Owner","Balance"].includes(item) ? "text-right" : ""}`}>
                      {item}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openingResult !== 0 && (
                  <tr className="border-t bg-[#F8FAFC]">
                    <td className="px-3 py-1.5 font-semibold" colSpan={6}>Opening balance (carried forward)</td>
                    <MoneyCell value={openingResult} signed />
                  </tr>
                )}
                {entries.map((row) => (
                  <tr key={row.id} className="h-9 border-t even:bg-[#FAFBFC] hover:bg-[#EEF4FF]">
                    <td className="whitespace-nowrap px-3 py-1 tabular-nums">{formatDate(row.date)}</td>
                    <td className="whitespace-nowrap px-3 py-1"><span className="font-semibold">{row.vehicle}</span>{row.owner && <span className="ml-1.5 text-xs text-[#475467]">{row.owner}</span>}</td>
                    <td className="max-w-[220px] px-3 py-1"><span className="block truncate" title={`${row.description}${row.reference ? ` · ${row.reference}` : ""}`}><span className="font-semibold">{row.kind}</span>{row.category && <span className="ml-1.5 text-xs text-[#475467]">{row.category}</span>}</span></td>
                    <MoneyCell value={row.income} />
                    <MoneyCell value={row.expense} negative />
                    <MoneyCell value={row.ownerMovement} signed />
                    <MoneyCell value={balances.get(row.id) ?? 0} signed />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {openingResult !== 0 && (
              <div className="flex justify-between rounded-xl border bg-[#F8FAFC] p-4 text-sm">
                <strong>Opening balance</strong>
                <strong>{formatPkr(openingResult)}</strong>
              </div>
            )}
            {entries.map((row) => (
              <article key={row.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#667085]">
                      {formatDate(row.date)} · {row.reference}
                    </p>
                    <h3 className="mt-1 font-bold">{row.vehicle}</h3>
                    {row.owner && <p className="text-xs text-[#667085]">{row.owner}</p>}
                  </div>
                  <span className="rounded-full bg-[#F2F4F7] px-2 py-1 text-xs font-semibold">{row.category ? `${row.kind} · ${row.category}` : row.kind}</span>
                </div>
                <p className="mt-3 text-sm text-[#475467]">{row.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <MobileAmount label="Income" value={row.income} />
                  <MobileAmount label="Expense" value={-row.expense} />
                  <MobileAmount label="Owner / source" value={row.ownerMovement} />
                  <MobileAmount label="Balance" value={balances.get(row.id) ?? 0} />
                </dl>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title="No ledger entries" description="No posted income, approved expenses, or owner/source payments match these filters." />
      )}
    </>
  );
}
function MoneyCell({ value, negative = false, signed = false }: { value: number; negative?: boolean; signed?: boolean }) {
  const display = negative && value ? -value : value;
  return (
    <td className={`whitespace-nowrap px-3 py-1 text-right tabular-nums ${display < 0 ? "font-semibold text-[#B42318]" : display > 0 ? "font-semibold text-[#067647]" : "text-[#98A2B3]"}`}>
      {display === 0 ? "—" : <>{signed && display > 0 ? "+" : ""}{formatPkr(display)}</>}
    </td>
  );
}
/** Owner statement split per car, each in the owner's familiar sheet layout. */
function OwnerLedgerTable({ entries, period }: { entries: LedgerEntry[]; period: string }) {
  const cars = ownerLedgerByCar(entries);
  if (!cars.length)
    return (
      <section className="rounded-xl border bg-white p-6 text-sm text-[#667085]">No owner share, allocated expense, or payout matches these filters.</section>
    );
  return (
    <div className="space-y-5">
      {cars.map((car) => (
        <OwnerCarSheet key={car.key} car={car} period={period} />
      ))}
    </div>
  );
}
function MobileAmount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] p-2">
      <dt className="text-[#667085]">{label}</dt>
      <dd className={`mt-1 font-bold ${value < 0 ? "text-[#B42318]" : value > 0 ? "text-[#067647]" : ""}`}>
        {value > 0 ? "+" : ""}
        {formatPkr(value)}
      </dd>
    </div>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`),
  );
}
function VehiclePnl({ rows, onDrill }: { rows: VehicleReportRow[]; onDrill: (value: { title: string; sources: ReportSource[] }) => void }) {
  const [showIdle, setShowIdle] = useState(false);
  const totals = rows.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, expenses: sum.expenses + row.expenses, share: sum.share + row.ownerShare }), { revenue: 0, expenses: 0, share: 0 });
  const sorted = [...rows].sort((a, b) => (b.revenue - b.expenses - b.ownerShare) - (a.revenue - a.expenses - a.ownerShare) || b.revenue - a.revenue);
  const active = sorted.filter((row) => row.revenue || row.expenses || row.ownerShare);
  const visible = showIdle ? sorted : active;
  const idleCount = sorted.length - active.length;
  const money = (value: number, title: string, sources: ReportSource[]) => value === 0
    ? <span className="text-[#98A2B3]">—</span>
    : <button type="button" className={`font-semibold tabular-nums hover:underline ${value < 0 ? "text-[#B42318]" : "text-[#19191F]"}`} onClick={() => onDrill({ title, sources })}>{formatPkr(value)}</button>;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Earned" value={formatPkr(totals.revenue)} note="Completed rentals this period" />
        <Metric label="Car expenses" value={formatPkr(totals.expenses)} note="Approved costs linked to cars" />
        <Metric label="Owner share" value={formatPkr(totals.share)} note="Owed to car owners" />
        <Metric label="Agency profit" value={formatPkr(totals.revenue - totals.expenses - totals.share)} note="Earned − car expenses − owner share" />
      </section>
      {rows.length ? (
        <div className="overflow-x-auto rounded-[8px] border border-[#D0D5DD] bg-white">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#F2F4F7] text-[#344054]"><tr>{["Car", "Earned", "Expenses", "Owner share", "Profit"].map((h, i) => <th key={h} className={`px-3 py-2 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="h-9 border-t even:bg-[#FAFBFC] hover:bg-[#EEF4FF]">
                  <td className="whitespace-nowrap px-3 py-1"><span className="font-semibold">{row.vehicle}</span><span className="ml-2 text-xs text-[#475467]">{row.ownership}</span></td>
                  <td className="px-3 py-1 text-right">{money(row.revenue, `${row.vehicle} · Earned`, row.sources)}</td>
                  <td className="px-3 py-1 text-right">{money(row.expenses, `${row.vehicle} · Expenses`, row.sources)}</td>
                  <td className="px-3 py-1 text-right">{money(row.ownerShare, `${row.vehicle} · Owner share`, row.sources)}</td>
                  <td className="px-3 py-1 text-right">{money(row.revenue - row.expenses - row.ownerShare, `${row.vehicle} · Profit`, row.sources)}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-[#475467]">No car earned or spent anything in this period.</td></tr>}
            </tbody>
          </table>
          {idleCount > 0 && <button type="button" onClick={() => setShowIdle((v) => !v)} className="w-full border-t border-[#EAECF0] px-3 py-2 text-left text-[13px] font-semibold text-[#0058B8] hover:bg-[#F8FAFC]">{showIdle ? "Hide cars with no activity" : `Show ${idleCount} cars with no activity`}</button>}
        </div>
      ) : (
        <EmptyState title="No vehicles match" description="Change the city or ownership filter." />
      )}
    </>
  );
}
function Collections({ data }: { data: ReportsData["periods"][number]["collections"] }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Booked" value={formatPkr(data.booked)} note="Rentals starting this period" />
        <Metric label="Collected" value={formatPkr(data.collected)} note="Payments received this period" />
        <Metric label="Not yet collected" value={formatPkr(data.outstanding)} note="Booked − collected" />
        <Metric label="Unpaid after return" value={formatPkr(data.overdue)} note="Balance on rentals past their return date" />
      </section>
      <Table headers={["Payment method", "Transactions", "Collected", "Share of collections"]}>
        {data.channels.map((row) => (
          <tr key={row.name} className="border-t">
            <td className="p-3 font-semibold">{row.name}</td>
            <td className="p-3">{row.count}</td>
            <td className="p-3 font-semibold">{formatPkr(row.collected)}</td>
            <td className="p-3">{data.collected ? Math.round((row.collected / data.collected) * 100) : 0}%</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
function Utilization({ rows }: { rows: VehicleReportRow[] }) {
  return (
    <>
      <p className="text-xs text-[#475467]">Days a car was out on rental ÷ days it could be rented (maintenance blocks excluded). Overdue rentals count until the car is back.</p>
      <Table headers={["Vehicle", "Eligible days", "Downtime", "Occupied", "Utilization"]}>
        {rows.map((row) => (
          <tr key={row.id} className="border-t">
            <td className="p-3 font-semibold">{row.vehicle}</td>
            <td className="p-3">{row.availableDays}</td>
            <td className="p-3">{row.downtime} days</td>
            <td className="p-3">{Math.round(((row.availableDays * row.utilization) / 100) * 10) / 10} days</td>
            <td className="p-3">
              <strong>{row.utilization}%</strong>
              <div className="mt-1 h-1.5 rounded bg-[#EAECF0]">
                <span className="block h-full rounded bg-[#006FE6]" style={{ width: `${row.utilization}%` }} />
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
function DrillDown({ data, onClose }: { data: { title: string; sources: ReportSource[] }; onClose: () => void }) {
  return (
    <section className="rounded-xl border border-[#B2DDFF] bg-white p-4">
      <div className="flex justify-between">
        <div>
          <h2 className="font-bold">Source drill-down</h2>
          <p className="text-xs text-[#667085]">{data.title}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {data.sources.length ? (
        <div className="mt-4 space-y-2">
          {data.sources.map((row) => (
            <div key={`${row.id}-${row.label}`} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] p-3 text-sm">
              <span>
                <strong>{row.id}</strong> · {row.label}
              </span>
              <span className="flex items-center gap-2 font-semibold">
                {formatPkr(row.amount)}
                <ExternalLink size={14} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#667085]">No source records contribute to this value.</p>
      )}
    </section>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-[#667085]">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-[#667085]">{note}</p>
    </div>
  );
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[#F8FAFC] text-xs text-[#667085]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="p-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
