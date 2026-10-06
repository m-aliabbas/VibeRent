"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createExpenseCategoryAction } from "@/app/actions/catalogs";
import { createExpenseAction } from "@/app/actions/expenses";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import type { ExpenseDto, ExpenseOption, ExpenseWorkspaceData } from "@/server/services/expense-service";

type Props = {
  data: ExpenseWorkspaceData;
  initialVehicleId?: string;
  onClose: () => void;
  onSave: (item: ExpenseDto) => void;
  onCategoryAdded?: (item: ExpenseOption) => void;
};

export function ExpenseDialog({ data, initialVehicleId = "", onClose, onSave, onCategoryAdded }: Props) {
  const [categories, setCategories] = useState(data.categories);
  const [form, setForm] = useState({
    occurredOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()),
    amount: 0,
    category: data.categories[0]?.label ?? "",
    description: "",
    vehicleId: initialVehicleId,
    bookingId: "",
    customerId: "",
    ownerId: "",
  });
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const bookingOptions = useMemo(
    () => data.bookings.filter(item => !form.vehicleId || item.vehicleId === form.vehicleId),
    [data.bookings, form.vehicleId],
  );
  const valid = form.amount > 0 && Boolean(form.description.trim()) && Boolean(form.category);

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
      const result = await createExpenseAction({
        ...form,
        vehicleId: form.vehicleId || undefined,
        bookingId: form.bookingId || undefined,
        customerId: form.customerId || undefined,
        ownerId: form.ownerId || undefined,
      });
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
              <Dialog.Title className="font-bold">Record expense</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#667085]">
                Saved to the agency ledger with optional customer, vehicle, booking, and owner attribution.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 place-items-center"><X /></Dialog.Close>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormInput label="Date" type="date" value={form.occurredOn} onChange={event => setForm({ ...form, occurredOn: event.target.value })} />
            <FormInput label="Amount (PKR)" type="number" value={form.amount || ""} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} />
            <div>
              <FormSelect label="Category" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} options={categories.map(item => item.label)} />
              {!addingCategory ? (
                <button type="button" className="mt-2 text-xs font-semibold text-[#006FE6]" onClick={() => setAddingCategory(true)}>+ Add category</button>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input aria-label="New expense category" value={newCategory} onChange={event => setNewCategory(event.target.value)} className="field h-9" placeholder="e.g. Utilities" />
                  <Button type="button" size="sm" disabled={pending || !newCategory.trim()} onClick={addCategory}>Save</Button>
                </div>
              )}
            </div>
            <FormInput label="Description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
            <FormCombobox label="Vehicle (optional)" value={form.vehicleId} onValueChange={vehicleId => setForm({ ...form, vehicleId, bookingId: "" })} searchPlaceholder="Search make, model or plate…" options={[{ label: "No vehicle", value: "" }, ...data.vehicles.map(item => ({ label: item.label, value: item.id }))]} />
            <FormCombobox label="Customer (optional)" value={form.customerId} onValueChange={customerId => setForm({ ...form, customerId, bookingId: "" })} searchPlaceholder="Search name, phone or CNIC…" options={[{ label: "No customer", value: "" }, ...data.customers.map(item => ({ label: item.label, value: item.id }))]} />
            <FormCombobox label="Booking (optional)" value={form.bookingId} onValueChange={selectBooking} searchPlaceholder="Search booking, vehicle or customer…" options={[{ label: "No booking", value: "" }, ...bookingOptions.map(item => ({ label: item.label, value: item.id }))]} />
            <FormCombobox label="Owner allocation (optional)" value={form.ownerId} onValueChange={ownerId => setForm({ ...form, ownerId })} searchPlaceholder="Search owner…" options={[{ label: "Agency expense", value: "" }, ...data.owners.map(item => ({ label: item.label, value: item.id }))]} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#667085]">Choosing a booking automatically uses its vehicle and customer. The server verifies all links before saving.</p>
          {error && <p role="alert" className="mt-3 text-sm text-[#B42318]">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid || pending} onClick={submit}>{pending ? "Submitting…" : "Submit expense"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
