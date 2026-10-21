"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { CalendarClock, Pause, Pencil, Play, Repeat, Square, X } from "lucide-react";
import { setRecurringExpenseStatusAction, updateRecurringExpenseAction } from "@/app/actions/expenses";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { describeSchedule } from "@/lib/recurring-schedule";
import { formatPkr } from "@/lib/utils";
import type { ExpenseDto, ExpenseOption } from "@/server/services/expense-service";
import type { RecurringExpenseDto } from "@/server/services/recurring-expense-service";

const statusLabel: Record<RecurringExpenseDto["status"], string> = { active: "Active", paused: "Paused", ended: "Ended" };

export function RecurringExpenseList({ items, categories, emptyText, onUpdated, onPosted, onNotice }: {
  items: RecurringExpenseDto[];
  categories: ExpenseOption[];
  emptyText: string;
  onUpdated: (item: RecurringExpenseDto) => void;
  onPosted?: (expenses: ExpenseDto[]) => void;
  onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState<RecurringExpenseDto>();
  const [ending, setEnding] = useState<RecurringExpenseDto>();
  const [pending, startTransition] = useTransition();

  function setStatus(item: RecurringExpenseDto, next: RecurringExpenseDto["status"]) {
    startTransition(async () => {
      const result = await setRecurringExpenseStatusAction(item.id, next);
      if (!result.ok) { onNotice(result.error.message); return; }
      onUpdated(result.data.recurring);
      if (result.data.posted.length) onPosted?.(result.data.posted);
      setEnding(undefined);
      onNotice(next === "active" ? `${item.description} resumed. Next charge on ${formatDay(result.data.recurring.nextDueOn)}.` : next === "paused" ? `${item.description} paused. No charges post until you resume it.` : `${item.description} ended. Posted charges are kept.`);
    });
  }

  if (!items.length) return <div className="rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]">{emptyText}</div>;

  return <>
    <div className="divide-y overflow-hidden rounded-xl border bg-white">{items.map(item => <article key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F4F3FF] text-[#5925DC]"><Repeat size={18} /></span>
      <div className="min-w-0 flex-1">
        <strong className="text-sm">{item.description}</strong>
        <p className="mt-1 text-xs text-[#667085]">{describeSchedule(item.frequency, item.dayOfMonth)} · {item.category}{item.plate && ` · ${item.plate}`} · {item.owner ? `Allocated to ${item.owner}` : "Agency expense"}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#667085]"><CalendarClock size={13} aria-hidden />
          {item.status === "active" ? <>Next charge <strong className="text-[#344054]">{formatDay(item.nextDueOn)}</strong></> : item.status === "paused" ? "Paused · no charges posting" : `Ended${item.endOn ? ` ${formatDay(item.endOn)}` : ""}`}
          <span>· {item.postedCount} posted{item.lastPostedOn ? `, last ${formatDay(item.lastPostedOn)}` : ""}</span>
          {item.endOn && item.status !== "ended" && <span>· until {formatDay(item.endOn)}</span>}
          <span>· {item.autoApprove ? "Auto-approved" : "Needs approval"}</span>
        </p>
      </div>
      <strong className="text-sm">{formatPkr(item.amount)}</strong>
      <StatusBadge status={statusLabel[item.status]} />
      {item.status !== "ended" && <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(item)}><Pencil size={14} />Edit</Button>
        {item.status === "active" ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus(item, "paused")}><Pause size={14} />Pause</Button> : <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus(item, "active")}><Play size={14} />Resume</Button>}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEnding(item)}><Square size={14} />End</Button>
      </div>}
    </article>)}</div>
    {editing && <EditRecurringDialog item={editing} categories={categories} onClose={() => setEditing(undefined)} onSaved={item => { setEditing(undefined); onUpdated(item); onNotice(`${item.description} updated. Changes apply to future charges.`); }} />}
    <ConfirmDialog open={Boolean(ending)} onOpenChange={open => !open && setEnding(undefined)} title={`End ${ending?.description ?? "recurring expense"}?`} description="No further charges will be posted. Charges already posted stay in Expenses. This cannot be resumed; create a new recurring expense if needed." onConfirm={() => ending && setStatus(ending, "ended")} pending={pending} confirmLabel="End recurring expense" pendingLabel="Ending…" />
  </>;
}

function EditRecurringDialog({ item, categories, onClose, onSaved }: { item: RecurringExpenseDto; categories: ExpenseOption[]; onClose: () => void; onSaved: (item: RecurringExpenseDto) => void }) {
  const [amount, setAmount] = useState(item.amount);
  const [description, setDescription] = useState(item.description);
  const [category, setCategory] = useState(item.category);
  const [endOn, setEndOn] = useState(item.endOn ?? "");
  const [autoApprove, setAutoApprove] = useState(item.autoApprove);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const minEnd = item.lastPostedOn ?? item.startOn;
  const endError = endOn && endOn < minEnd ? `Choose ${formatDay(minEnd)} or later.` : undefined;
  const valid = Number.isInteger(amount) && amount > 0 && Boolean(description.trim()) && Boolean(category) && !endError;
  const options = categories.some(option => option.label === item.category) ? categories.map(option => option.label) : [item.category, ...categories.map(option => option.label)];

  function save() {
    startTransition(async () => {
      setError("");
      const result = await updateRecurringExpenseAction(item.id, { amount, description, category, endOn: endOn || null, autoApprove, version: item.version });
      if (result.ok) onSaved(result.data); else setError(result.error.message);
    });
  }

  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
    <div className="flex justify-between gap-3"><div><Dialog.Title className="font-bold">Edit recurring expense</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">{describeSchedule(item.frequency, item.dayOfMonth)}{item.plate ? ` · ${item.plate}` : ""}. Changes apply to future charges only.</Dialog.Description></div><Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"><X /></Dialog.Close></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <FormInput label="Amount (PKR)" type="number" min={1} value={amount || ""} onChange={event => setAmount(Number(event.target.value))} />
      <FormSelect label="Category" value={category} onChange={event => setCategory(event.target.value)} options={options} />
      <div className="sm:col-span-2"><FormInput label="Description" value={description} onChange={event => setDescription(event.target.value)} /></div>
      <FormInput label="Ends on (optional)" type="date" min={minEnd} value={endOn} error={endError} hint="Leave empty to keep charging until you end it." onChange={event => setEndOn(event.target.value)} />
      <label className="flex items-start gap-3 self-center"><input type="checkbox" className="mt-1" checked={autoApprove} onChange={event => setAutoApprove(event.target.checked)} /><span className="text-sm font-semibold text-[#344054]">Post charges as approved</span></label>
    </div>
    <p className="mt-3 text-xs text-[#667085]">To change the vehicle, owner or schedule, end this one and create a new recurring expense.</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={!valid || pending} onClick={save}>{pending ? "Saving…" : "Save changes"}</Button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
