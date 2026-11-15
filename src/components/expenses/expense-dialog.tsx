"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createExpenseCategoryAction } from "@/app/actions/catalogs";
import { createExpenseAction, createRecurringExpenseAction, updateExpenseAction } from "@/app/actions/expenses";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import type { ExpenseDto, ExpenseOption, ExpenseSaveResult, ExpenseWorkspaceData } from "@/server/services/expense-service";
import type { RecurringExpenseDto } from "@/server/services/recurring-expense-service";
import { describeSchedule, recurringFrequencies, todayInPakistan, type RecurringFrequency } from "@/lib/recurring-schedule";
import { formatPkr } from "@/lib/utils";

export type RecurringSaveResult = { recurring: RecurringExpenseDto; posted: ExpenseDto[] };

type Props = {
  data: ExpenseWorkspaceData;
  initialVehicleId?: string;
  initialRepeat?: RecurringFrequency;
  record?: ExpenseDto;
  onClose: () => void;
  onSave: (item: ExpenseSaveResult) => void;
  onRecurringSaved?: (result: RecurringSaveResult) => void;
  onCategoryAdded?: (item: ExpenseOption) => void;
};

export function ExpenseDialog({ data, initialVehicleId = "", initialRepeat, record, onClose, onSave, onRecurringSaved, onCategoryAdded }: Props) {
  const [categories, setCategories] = useState(data.categories);
  const [form, setForm] = useState({
    occurredOn: record?.occurredOn ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()),
    amount: record?.amount ?? 0,
    // No silent default category: an alphabetical first item ("Cleaning") was being saved by mistake.
    category: record?.category ?? "",
    description: record?.description ?? "",
    vehicleId: record?.vehicleId ?? initialVehicleId,
    bookingId: record?.bookingId ?? "",
    customerId: record?.customerId ?? "",
    ownerId: record?.ownerId ?? "",
  });
  const canRepeat = !record && Boolean(onRecurringSaved);
  const [repeat, setRepeat] = useState<RecurringFrequency | "">(canRepeat ? initialRepeat ?? "" : "");
  const [endOn, setEndOn] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const repeating = canRepeat && repeat !== "";
  const endOnError = repeating && endOn && endOn < form.occurredOn ? "Choose a date on or after the first charge." : undefined;
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const bookingOptions = useMemo(
    () => data.bookings.filter(item => !form.vehicleId || item.vehicleId === form.vehicleId),
    [data.bookings, form.vehicleId],
  );
  const valid = form.amount > 0 && Boolean(form.description.trim()) && Boolean(form.category) && Boolean(form.occurredOn) && !endOnError;

  function selectBooking(bookingId: string) {
    const booking = data.bookings.find(item => item.id === bookingId);
    setForm(current => ({
      ...current,
      bookingId,
      vehicleId: booking?.vehicleId ?? current.vehicleId,
      customerId: booking?.customerId ?? current.customerId,
    }));
  }

  function addCategory() {
    if (!newCategory.trim()) return;
    startTransition(async () => {
      const result = await createExpenseCategoryAction(newCategory);
      if (!result.ok) { setError(result.error.message); return; }
      const item = { id: result.data.id, label: result.data.name };
      setCategories(current => [...current.filter(row => row.id !== item.id), item].sort((a, b) => a.label.localeCompare(b.label)));
      onCategoryAdded?.(item);
      setForm(current => ({ ...current, category: item.label }));
      setNewCategory("");
      setAddingCategory(false);
    });
  }

  function submit() {
    startTransition(async () => {
      setError("");
      if (repeating) {
        const result = await createRecurringExpenseAction({ vehicleId: form.vehicleId || undefined, ownerId: form.ownerId || undefined, amount: form.amount, category: form.category, description: form.description, startOn: form.occurredOn, frequency: repeat as RecurringFrequency, endOn: endOn || undefined, autoApprove });
        if (result.ok) onRecurringSaved?.(result.data);
        else setError(result.error.message);
        return;
      }
      const payload = {
        ...form,
        vehicleId: form.vehicleId || undefined,
        bookingId: form.bookingId || undefined,
        customerId: form.customerId || undefined,
        ownerId: form.ownerId || undefined,
      };
      const result = record ? await updateExpenseAction(record.id, payload) : await createExpenseAction(payload);
      if (result.ok) onSave(result.data);
      else setError(result.error.message);
    });
  }

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex justify-between">
            <div>
              <Dialog.Title className="font-bold">{record ? "Edit expense" : repeating ? "Record recurring expense" : "Record expense"}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#667085]">
                Saved to the agency ledger with optional customer, vehicle, booking, and owner attribution.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 place-items-center"><X /></Dialog.Close>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {canRepeat && initialRepeat && <div className="sm:col-span-2"><FormSelect label="Repeat" value={repeat} onChange={event => setRepeat(event.target.value as RecurringFrequency | "")} options={[{ label: "Does not repeat", value: "" }, ...recurringFrequencies]} /></div>}
            <FormInput label="Amount (PKR)" type="number" inputMode="numeric" autoFocus value={form.amount || ""} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} />
            <div>
              <FormSelect label="Category" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} options={[{ label: "Choose a category", value: "" }, ...categories.map(item => ({ label: item.label, value: item.label }))]} />
              {!addingCategory ? (
                <button type="button" className="mt-1.5 text-xs font-semibold text-[#006FE6]" onClick={() => setAddingCategory(true)}>+ Add category</button>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input aria-label="New expense category" value={newCategory} onChange={event => setNewCategory(event.target.value)} className="field h-9" placeholder="e.g. Utilities" />
                  <Button type="button" size="sm" disabled={pending || !newCategory.trim()} onClick={addCategory}>Save</Button>
                </div>
              )}
            </div>
            <div>
              <FormInput label={repeating ? "First charge on" : "Date"} type="date" value={form.occurredOn} onChange={event => setForm({ ...form, occurredOn: event.target.value })} />
              {!repeating && <div className="mt-1.5 flex gap-1">{([["Today", 0], ["Yesterday", 1]] as const).map(([label, back]) => { const value = shiftDay(todayInPakistan(), -back); return <button key={label} type="button" aria-pressed={form.occurredOn === value} onClick={() => setForm({ ...form, occurredOn: value })} className={`h-7 rounded-full border px-2.5 text-xs font-semibold ${form.occurredOn === value ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : "border-[#D0D5DD] bg-white text-[#344054]"}`}>{label}</button>; })}</div>}
            </div>
            <FormInput label="Description" placeholder="e.g. Brake pads, Lahore toll" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
            <FormCombobox label="Car (optional)" value={form.vehicleId} onValueChange={vehicleId => setForm({ ...form, vehicleId, bookingId: "" })} searchPlaceholder="Search make, model or plate…" options={[{ label: "No car", value: "" }, ...data.vehicles.map(item => ({ label: item.label, value: item.id }))]} />
            {repeating && <FormInput label="Ends on (optional)" type="date" min={form.occurredOn} value={endOn} error={endOnError} hint="Leave empty to keep charging until you end it." onChange={event => setEndOn(event.target.value)} />}
            <details className="sm:col-span-2" open={Boolean(form.customerId || form.bookingId || form.ownerId)}>
              <summary className="cursor-pointer text-sm font-semibold text-[#475467]">{repeating ? "Charge to an owner" : "Link to a customer, booking or owner"}</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {!repeating && <FormCombobox label="Customer" value={form.customerId} onValueChange={customerId => setForm({ ...form, customerId, bookingId: "" })} searchPlaceholder="Search name, phone or CNIC…" options={[{ label: "No customer", value: "" }, ...data.customers.map(item => ({ label: item.label, value: item.id }))]} />}
                {!repeating && <FormCombobox label="Booking" value={form.bookingId} onValueChange={selectBooking} searchPlaceholder="Search booking, vehicle or customer…" options={[{ label: "No booking", value: "" }, ...bookingOptions.map(item => ({ label: item.label, value: item.id }))]} />}
                <FormCombobox label="Charged to owner" value={form.ownerId} onValueChange={ownerId => setForm({ ...form, ownerId })} searchPlaceholder="Search owner…" options={[{ label: "Agency pays", value: "" }, ...data.owners.map(item => ({ label: item.label, value: item.id }))]} />
              </div>
            </details>
            {canRepeat && !initialRepeat && <div className="sm:col-span-2"><FormSelect label="Repeat" value={repeat} onChange={event => setRepeat(event.target.value as RecurringFrequency | "")} options={[{ label: "Does not repeat", value: "" }, ...recurringFrequencies]} /></div>}
          </div>
          {repeating ? <div className="mt-4 rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4">
            <p className="text-sm font-bold text-[#175CD3]">{form.occurredOn ? describeSchedule(repeat as RecurringFrequency, Number(form.occurredOn.slice(8, 10))) : "Choose the first charge date"}{form.amount > 0 && ` · ${formatPkr(form.amount)}`}</p>
            <p className="mt-1 text-xs leading-5 text-[#475467]">{form.occurredOn && form.occurredOn <= todayInPakistan() ? "Charges from the first date up to today are posted now; later ones post automatically on their due dates." : "Each charge is posted automatically on its due date."} Booking and customer links are not used for recurring charges.</p>
            <label className="mt-3 flex items-start gap-3"><input type="checkbox" className="mt-1" checked={autoApprove} onChange={event => setAutoApprove(event.target.checked)} /><span><span className="block text-sm font-semibold text-[#344054]">Post charges as approved</span><span className="mt-0.5 block text-xs text-[#667085]">Untick to send each charge for approval like a normal expense.</span></span></label>
          </div> : null}
          {record?.status==="approved"&&<p className="mt-3 rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D]">Saving a correction reverses this approved expense and creates a new submitted expense for approval. The original remains in the audit trail.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-[#B42318]">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid || pending} onClick={submit}>{pending ? "Saving…" : record?.status==="approved" ? "Save correction" : record ? "Save changes" : repeating ? "Save recurring expense" : "Submit expense"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function shiftDay(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
