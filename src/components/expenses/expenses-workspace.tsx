"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState, useTransition } from "react";
import { FileText, Plus, Repeat, X } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { OverflowMenu } from "@/components/shared/action-menu";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { transitionExpenseAction } from "@/app/actions/expenses";
import { ExpenseDialog, type RecurringSaveResult } from "@/components/expenses/expense-dialog";
import { RecurringExpenseList } from "@/components/expenses/recurring-expenses";
import { ExpenseRecoveries } from "@/components/expenses/expense-recoveries";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/utils";
import type { ExpenseDto, ExpenseWorkspaceData } from "@/server/services/expense-service";
import type { ExpenseStatus } from "@/server/validation/expense";

const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
type Sort = "Newest" | "Oldest" | "Amount high" | "Amount low";

export function ExpensesWorkspace({ data }: { data: ExpenseWorkspaceData }) {
  const [items, setItems] = useState(data.expenses);
  const [categories, setCategories] = useState(data.categories);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [vehicle, setVehicle] = useState("All");
  const [customer, setCustomer] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receipt, setReceipt] = useState("All");
  const [allocation, setAllocation] = useState("All");
  const [sort, setSort] = useState<Sort>("Newest");
  const [open, setOpen] = useState<false | "once" | "recurring">(false);
  const [recurring, setRecurring] = useState(data.recurring);
  const [view, setView] = useState<"expenses" | "recurring">("expenses");
  const [editing, setEditing] = useState<ExpenseDto>();
  const [selected, setSelected] = useState<ExpenseDto>();
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(()=>{queueMicrotask(()=>{const params=new URLSearchParams(window.location.search);setSearch(params.get("q")??"");if(params.get("view")==="recurring")setView("recurring")})},[]);
  function changeView(next: "expenses" | "recurring") {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "recurring") params.set("view", "recurring"); else params.delete("view");
    window.history.pushState(null, "", `/expenses${params.size ? `?${params}` : ""}`);
  }
  function addPosted(posted: ExpenseDto[]) {
    setItems(current => [...posted, ...current.filter(row => !posted.some(item => item.id === row.id))]);
  }
  function recurringSaved(result: RecurringSaveResult) {
    setRecurring(current => [result.recurring, ...current.filter(item => item.id !== result.recurring.id)]);
    addPosted(result.posted);
    setOpen(false);
    changeView("recurring");
    setNotice(result.posted.length ? `${result.recurring.description} set up. ${result.posted.length} charge${result.posted.length === 1 ? "" : "s"} posted up to today.` : `${result.recurring.description} set up. First charge posts on ${result.recurring.nextDueOn}.`);
  }
  const activeRecurring = recurring.filter(item => item.status === "active");

  const rows = useMemo(() => items.filter(expense =>
    (category === "All" || expense.category === category) &&
    (status === "All" || expense.status === status) &&
    (vehicle === "All" || expense.vehicleId === vehicle) &&
    (customer === "All" || expense.customerId === customer) &&
    (!from || expense.occurredOn >= from) && (!to || expense.occurredOn <= to) &&
    (receipt === "All" || (receipt === "Attached") === expense.receipt) &&
    (allocation === "All" || (allocation === "Owner") === Boolean(expense.ownerId)) &&
    `${expense.id} ${expense.description} ${expense.plate ?? ""} ${expense.bookingId ?? ""} ${expense.customer ?? ""} ${expense.owner ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => sort === "Newest" ? b.occurredOn.localeCompare(a.occurredOn) : sort === "Oldest" ? a.occurredOn.localeCompare(b.occurredOn) : sort === "Amount high" ? b.amount - a.amount : a.amount - b.amount), [items, search, category, status, vehicle, customer, from, to, receipt, allocation, sort]);

  const [page, setPage] = useState(1);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("new") === "1") queueMicrotask(() => setOpen("once")); }, []);
  const pageSize = 25;
  useEffect(() => { queueMicrotask(() => setPage(1)); }, [search, category, status, vehicle, customer, from, to, receipt, allocation, sort]);
  const filteredApproved = rows.filter(expense => expense.status === "approved").reduce((sum, expense) => sum + expense.amount, 0);
  const hasFilters = Boolean(search || category !== "All" || status !== "All" || vehicle !== "All" || customer !== "All" || from || to || receipt !== "All" || allocation !== "All");
  function clear() { setSearch(""); setCategory("All"); setStatus("All"); setVehicle("All"); setCustomer("All"); setFrom(""); setTo(""); setReceipt("All"); setAllocation("All"); }
  function transition(id: string, next: ExpenseStatus) {
    startTransition(async () => {
      const result = await transitionExpenseAction(id, next);
      if (!result.ok) { setNotice(result.error.message); return; }
      setItems(current => current.map(item => item.id === id ? result.data : item));
      setSelected(current => current?.id === id ? result.data : current);
      setNotice(`Expense ${id} moved to ${title(next)}.`);
    });
  }

  const metrics = [
    { label: "Approved spend", value: formatPkr(items.filter(item => item.status === "approved").reduce((sum, item) => sum + item.amount, 0)), note: "All approved expenses", selected: status === "approved" && receipt === "All", onClick: () => { clear(); setStatus("approved"); } },
    { label: "Awaiting approval", value: String(items.filter(item => item.status === "submitted").length), note: "Submitted, not yet approved", attention: items.some(item => item.status === "submitted"), selected: status === "submitted", onClick: () => { clear(); setStatus("submitted"); } },
    { label: "Missing receipt", value: String(items.filter(item => !item.receipt && item.status !== "reversed").length), note: "Attach a receipt photo", attention: items.some(item => !item.receipt && item.status !== "reversed"), selected: receipt === "Missing", onClick: () => { clear(); setReceipt("Missing"); } },
    { label: "Owner allocated", value: formatPkr(items.filter(item => item.ownerId && item.status === "approved").reduce((sum, item) => sum + item.amount, 0)), note: "Charged to vehicle owners", selected: allocation === "Owner", onClick: () => { clear(); setAllocation("Owner"); setStatus("approved"); } },
  ];
  const columns: DataColumn<ExpenseDto>[] = [
    { key: "date", header: "Date", cell: item => <span className="whitespace-nowrap tabular-nums text-[#344054]">{formatDay(item.occurredOn)}</span> },
    { key: "description", header: "Expense", cell: item => <div className="min-w-0"><span className="font-semibold text-[#19191F]">{item.description}</span>{item.recurringExpenseId && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#F2F4F7] px-2 py-0.5 text-xs font-semibold text-[#475467]"><Repeat size={11} aria-hidden />Recurring</span>}<p className="text-xs text-[#475467]">{item.category}{!item.receipt && item.status !== "reversed" && <span className="ml-1.5">· no receipt</span>}</p></div> },
    { key: "linked", header: "Linked to", cell: item => <span className="text-[#344054]">{[item.plate, item.customer, item.owner ? `Owner: ${item.owner}` : ""].filter(Boolean).join(" · ") || "Agency"}</span> },
    { key: "amount", header: "Amount", className: "text-right", cell: item => <div className="whitespace-nowrap"><span className="font-semibold tabular-nums">{formatPkr(item.amount)}</span>{item.recovered > 0 && <p className="text-xs font-semibold text-[#067647]">{item.recovered >= item.amount ? "Fully returned" : `${formatPkr(item.recovered)} returned`}</p>}</div> },
    { key: "status", header: "Status", cell: item => <StatusBadge status={title(item.status)} /> },
    { key: "actions", header: "", className: "text-right", cell: item => <ExpenseActions item={item} pending={pending} transition={transition} inRow /> },
  ];

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={() => setNotice("")} />
    <PageHeader eyebrow="Fleet finance" title="Expenses" description="Track agency, customer, vehicle, booking, and owner costs with an approval trail." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" shortcut="shift+n" onClick={() => setOpen("recurring")}><Repeat size={17} />Add recurring</Button><Button shortcut="n" onClick={() => setOpen("once")}><Plus size={17} />Add expense</Button></div>} />
    <div className="flex gap-1 border-b border-[#E4E7EC]" role="tablist" aria-label="Expense views">{([["expenses", "Expenses", items.length], ["recurring", "Recurring charges", activeRecurring.length]] as const).map(([value, label, count]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => changeView(value)} className={`-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${view === value ? "border-[#006FE6] text-[#0058B8]" : "border-transparent text-[#475467] hover:text-[#19191F]"}`}>{label}<span className="text-xs tabular-nums text-[#475467]">{count}</span></button>)}</div>
    {view === "recurring" ? <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Recurring charges</h2><p className="mt-1 text-xs text-[#667085]">Fixed charges such as tracker fees, parking, insurance instalments or loan payments. Each charge is posted to Expenses automatically on its due date.</p></div><p className="text-xs font-semibold text-[#475467]">{formatPkr(activeRecurring.filter(item => item.frequency === "monthly").reduce((sum, item) => sum + item.amount, 0))} per month in active monthly charges</p></div>
      <RecurringExpenseList items={recurring} categories={categories} emptyText="No recurring charges yet. Use Add recurring to set up a fixed monthly charge." onUpdated={item => setRecurring(current => current.map(row => row.id === item.id ? item : row))} onPosted={addPosted} onNotice={setNotice} />
    </section> : <>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Expense summary">{metrics.map(metric => <button type="button" key={metric.label} aria-pressed={metric.selected} onClick={metric.onClick} className={`rounded-xl border bg-white p-4 text-left transition hover:border-[#84CAFF] ${metric.selected ? "border-[#006FE6] ring-2 ring-[#006FE6]/10" : "border-[#E8ECF2]"}`}><p className="text-xs font-semibold text-[#475467]">{metric.label}</p><p className={`mt-1 text-xl font-bold tabular-nums ${metric.attention ? "text-[#B54708]" : ""}`}>{metric.value}</p><p className="mt-0.5 text-xs text-[#667085]">{metric.note}</p></button>)}</section>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search expense, vehicle, customer, booking, or owner…" hasFilters={hasFilters} onClear={clear} summary={<>{rows.length} records · approved <strong className="tabular-nums">{formatPkr(filteredApproved)}</strong></>}>
      <FilterSelect label="Category" value={category} onChange={setCategory} options={categories.map(item => item.label)} />
      <FilterSelect label="Status" value={status} onChange={setStatus} options={["draft", "submitted", "approved", "rejected", "reversed"]} />
      <FilterSelect label="Vehicle" value={vehicle} onChange={setVehicle} options={data.vehicles.map(item => ({ label: item.label, value: item.id }))} />
      <FilterSelect label="Customer" value={customer} onChange={setCustomer} options={data.customers.map(item => ({ label: item.label, value: item.id }))} />
      <FilterSelect label="Receipt" value={receipt} onChange={setReceipt} options={["Attached", "Missing"]} />
      <DateRangeFilter from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
      <label className="min-w-0"><span className="mb-1 block text-xs font-bold uppercase tracking-[.04em] text-[#475467]">Sort</span><select value={sort} onChange={event => setSort(event.target.value as Sort)} className="h-9 w-full rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]">{["Newest", "Oldest", "Amount high", "Amount low"].map(option => <option key={option}>{option}</option>)}</select></label>
    </FilterBar>
    {rows.length ? <DataTable rows={rows.slice((page - 1) * pageSize, page * pageSize)} columns={columns} rowKey={item => item.id} page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onRowClick={setSelected} empty={null} mobileCard={item => <button type="button" onClick={() => setSelected(item)} className="block w-full text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold">{item.description}</p><p className="mt-0.5 text-xs text-[#475467]">{formatDay(item.occurredOn)} · {item.category}{item.plate && ` · ${item.plate}`}</p></div><strong className="shrink-0 text-sm tabular-nums">{formatPkr(item.amount)}</strong></div><div className="mt-2"><StatusBadge status={title(item.status)} /></div></button>} /> : <EmptyState icon={<FileText />} title="No expenses found" description={items.length ? "No expenses match the active filters." : "Record the first expense for this agency."} />}
    </>}
    {(open || editing) && <ExpenseDialog key={editing?.id ?? `new-${open}`} record={editing} initialRepeat={open === "recurring" ? "monthly" : undefined} onRecurringSaved={recurringSaved} data={{ ...data, categories }} onClose={() => { setOpen(false); setEditing(undefined); }} onCategoryAdded={item => setCategories(current => current.some(row => row.id === item.id) ? current : [...current, item].sort((a, b) => a.label.localeCompare(b.label)))} onSave={item => { setItems(current => [item, ...current.filter(row => row.id !== item.id)].map(row=>row.id===item.replacesExpenseId?{...row,status:"reversed"}:row)); setSelected(current => current?.id === item.id ? item : current); setOpen(false); setEditing(undefined); setNotice(item.replacesExpenseId?`${item.replacesExpenseId} reversed; ${item.id} submitted for approval.`:`${item.id} saved.`); }} />}
    {selected && <ExpenseDetail item={selected} pending={pending} onNotice={setNotice} onChange={next => { setItems(current => current.map(row => row.id === next.id ? next : row)); setSelected(next); }} onClose={() => setSelected(undefined)} onEdit={() => { setEditing(selected); setSelected(undefined); }} transition={transition} />}
  </div>;
}

function ExpenseActions({ item, pending, transition, inRow }: { item: ExpenseDto; pending: boolean; transition: (id: string, next: ExpenseStatus) => void; inRow?: boolean }) {
  if (inRow && item.status === "approved") return <OverflowMenu label={`More actions for ${item.description}`} items={[{ label: "Reverse expense…", icon: <Repeat size={15} />, danger: true, disabled: pending, onSelect: () => transition(item.id, "reversed") }]} />;
  return <div className="flex flex-wrap justify-end gap-1">{item.status === "draft" && <Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "submitted")}>Submit</Button>}{item.status === "submitted" && <><Button disabled={pending} size="sm" onClick={() => transition(item.id, "approved")}>Approve</Button><Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "rejected")}>Reject</Button></>}{item.status === "approved" && <Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "reversed")}>Reverse</Button>}{item.status === "rejected" && <Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "draft")}>Revise</Button>}</div>;
}

function ExpenseDetail({ item, pending, onClose, onEdit, transition, onChange, onNotice }: { item: ExpenseDto; pending: boolean; onClose: () => void; onEdit: () => void; transition: (id: string, next: ExpenseStatus) => void; onChange: (item: ExpenseDto) => void; onNotice: (message: string) => void }) {
  const fields = [["Description", item.description], ["Amount", formatPkr(item.amount)], ["Category", item.category], ["Date", item.occurredOn], ["Vehicle", item.plate ?? "Not allocated"], ["Customer", item.customer ?? "Not allocated"], ["Booking", item.bookingId ?? "Not linked"], ["Owner", item.owner ?? "Agency"], ["Receipt", item.receipt ? "Attached" : "Missing"]];
  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto max-h-[92vh] overflow-y-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between"><div><Dialog.Title className="font-bold">{item.id}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Persisted expense record</Dialog.Description></div><Dialog.Close aria-label="Close" className="grid h-10 w-10 place-items-center"><X /></Dialog.Close></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><div className="mt-5 flex items-center justify-between"><StatusBadge status={title(item.status)} /><div className="flex gap-2">{item.status!=="reversed" && <Button size="sm" variant="secondary" onClick={onEdit}>{item.status==="approved"?"Correct":"Edit"}</Button>}<ExpenseActions item={item} pending={pending} transition={transition} /></div></div><ExpenseRecoveries key={item.id} item={item} onChange={onChange} onNotice={onNotice} /></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function formatDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
