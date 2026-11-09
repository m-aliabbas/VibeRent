"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Receipt } from "lucide-react";
import { saveOwnerFixedChargeAction } from "@/app/actions/owners";
import { FormInput } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/utils";
import type { OwnerFixedChargeSettings } from "@/server/services/owner-fixed-charge-service";

/** Agency-wide monthly charge posted to every owner-managed car; editing it re-applies to all cars and months. */
export function OwnerFixedChargePanel({
  initial,
  managedVehicles,
  canEdit,
  onSaved,
}: {
  initial: OwnerFixedChargeSettings;
  managedVehicles: number;
  canEdit: boolean;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState({
    amount: initial.amount ? String(initial.amount) : "",
    label: initial.label,
    fromMonth: initial.fromMonth ?? new Date().toISOString().slice(0, 7),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const amount = Number(form.amount || 0);
  const dirty = amount !== saved.amount || form.label.trim() !== saved.label || (amount > 0 && form.fromMonth !== saved.fromMonth);
  function save() {
    setError("");
    setErrors({});
    startTransition(async () => {
      const result = await saveOwnerFixedChargeAction({ amount, label: form.label, fromMonth: form.fromMonth });
      if (!result.ok) {
        setError(result.error.message);
        setErrors(result.error.fieldErrors);
        return;
      }
      setSaved(result.data);
      onSaved(
        result.data.amount
          ? `${result.data.label} of ${formatPkr(result.data.amount)} per car per month now applies to every owner ledger from ${result.data.fromMonth}.`
          : "Fixed charges are turned off for all owner ledgers.",
      );
      router.refresh();
    });
  }
  return (
    <section className="rounded-xl border border-[#E8ECF2] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]">
          <Receipt size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Owner fixed charges</h2>
          <p className="mt-1 text-xs leading-5 text-[#667085]">
            A monthly charge posted as an owner expense for every managed car — an owner with 3 cars is charged 3 times.
            {saved.amount > 0
              ? ` Currently ${formatPkr(saved.amount)} per car per month (${formatPkr(saved.amount * managedVehicles)} across ${managedVehicles} active cars) from ${saved.fromMonth}.`
              : " Currently off."}{" "}
            Changing the amount re-applies it to all owners and months.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <FormInput
          label="Amount per car / month (PKR)"
          type="number"
          min={0}
          step={1}
          value={form.amount}
          placeholder="0 = off"
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          error={errors.amount}
          disabled={!canEdit || pending}
        />
        <FormInput
          label="Expense head"
          value={form.label}
          onChange={(event) => setForm({ ...form, label: event.target.value })}
          error={errors.label}
          disabled={!canEdit || pending}
        />
        <FormInput
          label="Charge from month"
          type="month"
          value={form.fromMonth}
          onChange={(event) => setForm({ ...form, fromMonth: event.target.value })}
          error={errors.fromMonth}
          disabled={!canEdit || pending || amount <= 0}
        />
        <Button onClick={save} disabled={!canEdit || pending || !dirty || !Number.isSafeInteger(amount) || amount < 0}>
          {pending ? "Saving…" : "Save & apply"}
        </Button>
      </div>
      {!canEdit && <p className="mt-2 text-xs text-[#667085]">Only agency owners and accountants can change fixed charges.</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">
          {error}
        </p>
      )}
    </section>
  );
}
