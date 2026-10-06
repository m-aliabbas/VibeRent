"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { ChevronRight, FileText, Plus, X } from "lucide-react";
import { transitionExpenseAction } from "@/app/actions/expenses";
import { ExpenseDialog } from "@/components/expenses/expense-dialog";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
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
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ExpenseDto>();
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

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
    { label: "Approved spend", value: formatPkr(items.filter(item => item.status === "approved").reduce((sum, item) => sum + item.amount, 0)), onClick: () => { clear(); setStatus("approved"); } },
    { label: "Submitted", value: String(items.filter(item => item.status === "submitted").length), onClick: () => { clear(); setStatus("submitted"); } },
    { label: "Receipts attached", value: String(items.filter(item => item.receipt).length), onClick: () => { clear(); setReceipt("Attached"); } },
    { label: "Owner allocated", value: formatPkr(items.filter(item => item.ownerId && item.status === "approved").reduce((sum, item) => sum + item.amount, 0)), onClick: () => { clear(); setAllocation("Owner"); setStatus("approved"); } },
  ];

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={() => setNotice("")} />
    <PageHeader eyebrow="Fleet finance" title="Expenses" description="Track agency, customer, vehicle, booking, and owner costs with an approval trail." actions={<Button onClick={() => setOpen(true)}><Plus size={17} />Add expense</Button>} />
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(metric => <button type="button" key={metric.label} onClick={metric.onClick} className="rounded-xl border bg-white p-4 text-left transition hover:border-[#84CAFF]"><p className="text-xs text-[#667085]">{metric.label}</p><p className="mt-2 text-xl font-bold">{metric.value}</p></button>)}</section>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search expense, vehicle, customer, booking, or owner…" hasFilters={hasFilters} onClear={clear}>
      <FilterSelect label="Category" value={category} onChange={setCategory} options={categories.map(item => item.label)} />
      <FilterSelect label="Status" value={status} onChange={setStatus} options={["draft", "submitted", "approved", "rejected", "reversed"]} />
      <FilterSelect label="Vehicle" value={vehicle} onChange={setVehicle} options={data.vehicles.map(item => ({ label: item.label, value: item.id }))} />
      <FilterSelect label="Customer" value={customer} onChange={setCustomer} options={data.customers.map(item => ({ label: item.label, value: item.id }))} />
      <FilterSelect label="Receipt" value={receipt} onChange={setReceipt} options={["Attached", "Missing"]} />
    </FilterBar>
    <div className="grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-3"><FormInput label="From" type="date" value={from} onChange={event => setFrom(event.target.value)} /><FormInput label="To" type="date" value={to} onChange={event => setTo(event.target.value)} /><FormSelect label="Sort" value={sort} onChange={event => setSort(event.target.value as Sort)} options={["Newest", "Oldest", "Amount high", "Amount low"]} /></div>
    <p className="text-xs text-[#667085]">{rows.length} matching records · approved total {formatPkr(filteredApproved)}</p>
    {rows.length ? <div className="overflow-hidden rounded-xl border bg-white"><div className="divide-y">{rows.map(item => <article key={item.id} tabIndex={0} role="button" onClick={event => { if (!(event.target as HTMLElement).closest("button")) setSelected(item); }} onKeyDown={event => { if (event.key === "Enter") setSelected(item); }} className="flex cursor-pointer flex-col gap-3 p-4 transition hover:bg-[#FAFCFF] focus:bg-[#F5FAFF] focus:outline-2 focus:outline-[#006FE6] lg:flex-row lg:items-center"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><FileText size={18} /></span><div className="min-w-0 flex-1"><strong className="text-sm">{item.description}</strong><p className="mt-1 text-xs text-[#667085]">{item.id} · {item.occurredOn}{item.plate && ` · ${item.plate}`}{item.customer && ` · ${item.customer}`}{item.bookingId && ` · ${item.bookingId}`}</p><p className="mt-1 text-xs text-[#667085]">{item.category} · {item.owner ? `Allocated to ${item.owner}` : "Agency expense"} · {item.receipt ? "Receipt attached" : "No receipt"}</p></div><strong>{formatPkr(item.amount)}</strong><StatusBadge status={title(item.status)} /><ExpenseActions item={item} pending={pending} transition={transition} /><ChevronRight size={17} className="text-[#98A2B3]" /></article>)}</div></div> : <EmptyState icon={<FileText />} title="No expenses found" description={items.length ? "No expenses match the active filters." : "Record the first expense for this agency."} />}
    {open && <ExpenseDialog data={{ ...data, categories }} onClose={() => setOpen(false)} onCategoryAdded={item => setCategories(current => current.some(row => row.id === item.id) ? current : [...current, item].sort((a, b) => a.label.localeCompare(b.label)))} onSave={item => { setItems(current => [item, ...current]); setOpen(false); setNotice(`${item.id} submitted for approval.`); }} />}
    {selected && <ExpenseDetail item={selected} pending={pending} onClose={() => setSelected(undefined)} transition={transition} />}
  </div>;
}

function ExpenseActions({ item, pending, transition }: { item: ExpenseDto; pending: boolean; transition: (id: string, next: ExpenseStatus) => void }) {
  return <div className="flex flex-wrap gap-1">{item.status === "draft" && <Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "submitted")}>Submit</Button>}{item.status === "submitted" && <><Button disabled={pending} size="sm" onClick={() => transition(item.id, "approved")}>Approve</Button><Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "rejected")}>Reject</Button></>}{item.status === "approved" && <Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "reversed")}>Reverse</Button>}{item.status === "rejected" && <Button disabled={pending} size="sm" variant="secondary" onClick={() => transition(item.id, "draft")}>Revise</Button>}</div>;
}

function ExpenseDetail({ item, pending, onClose, transition }: { item: ExpenseDto; pending: boolean; onClose: () => void; transition: (id: string, next: ExpenseStatus) => void }) {
  const fields = [["Description", item.description], ["Amount", formatPkr(item.amount)], ["Category", item.category], ["Date", item.occurredOn], ["Vehicle", item.plate ?? "Not allocated"], ["Customer", item.customer ?? "Not allocated"], ["Booking", item.bookingId ?? "Not linked"], ["Owner", item.owner ?? "Agency"], ["Receipt", item.receipt ? "Attached" : "Missing"]];
  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between"><div><Dialog.Title className="font-bold">{item.id}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Persisted expense record</Dialog.Description></div><Dialog.Close aria-label="Close" className="grid h-10 w-10 place-items-center"><X /></Dialog.Close></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><div className="mt-5 flex items-center justify-between"><StatusBadge status={title(item.status)} /><ExpenseActions item={item} pending={pending} transition={transition} /></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
