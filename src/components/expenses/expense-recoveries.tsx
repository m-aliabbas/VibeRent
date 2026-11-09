"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { recordExpenseRecoveryAction, reverseExpenseRecoveryAction } from "@/app/actions/expenses";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { todayInPakistan } from "@/lib/recurring-schedule";
import { formatPkr } from "@/lib/utils";
import type { ExpenseDto, ExpenseRecoveryDto } from "@/server/services/expense-service";

const sources = [
  { label: "Customer", value: "customer" },
  { label: "Driver", value: "driver" },
  { label: "Owner", value: "owner" },
  { label: "Insurance", value: "insurance" },
  { label: "Vendor / workshop", value: "vendor" },
  { label: "Other", value: "other" },
];
const methods = ["Cash", "Bank transfer", "JazzCash", "Easypaisa", "Cheque", "Adjusted in rent"];

/**
 * Expense reconciliation: how much of this expense came back to the agency, from whom, and when.
 * Recoveries are dated so the ledger credits them on the day the money returned.
 */
export function ExpenseRecoveries({ item, onChange, onNotice }: { item: ExpenseDto; onChange: (item: ExpenseDto) => void; onNotice: (message: string) => void }) {
  const remaining = item.amount - item.recovered;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(() => blank(item));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reversing, setReversing] = useState<ExpenseRecoveryDto>();
  const [pending, startTransition] = useTransition();
  const percent = item.amount ? Math.round((item.recovered / item.amount) * 100) : 0;
  const amountError = form.amount > remaining ? `Only ${formatPkr(remaining)} is still unrecovered.` : undefined;
  const valid = form.amount > 0 && !amountError && Boolean(form.receivedOn) && form.receivedOn >= item.occurredOn;

  function save() {
    if (!valid || pending) return;
    startTransition(async () => {
      const result = await recordExpenseRecoveryAction(item.id, { ...form, idempotencyKey: key });
      if (!result.ok) {
        setErrors(result.error.fieldErrors);
        onNotice(result.error.message);
        return;
      }
      onChange(result.data);
      onNotice(`${formatPkr(form.amount)} recorded as returned against ${item.id}.`);
      setAdding(false);
      setErrors({});
      setForm(blank(result.data));
      setKey(crypto.randomUUID());
    });
  }
  function reverse() {
    if (!reversing) return;
    startTransition(async () => {
      const result = await reverseExpenseRecoveryAction(item.id, reversing.id);
      if (!result.ok) {
        onNotice(result.error.message);
        return;
      }
      onChange(result.data);
      onNotice(`${reversing.id} reversed.`);
      setReversing(undefined);
    });
  }

  return (
    <section className="mt-5 rounded-xl border bg-[#F8FAFC] p-4" aria-labelledby={`recoveries-${item.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`recoveries-${item.id}`} className="text-sm font-bold">
            Reconciliation
          </h3>
          <p className="mt-0.5 text-xs text-[#667085]">Money returned to the agency against this expense.</p>
        </div>
        {item.status === "approved" && remaining > 0 && !adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Record return
          </Button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-white p-2">
          <dt className="text-[#667085]">Expense</dt>
          <dd className="mt-0.5 font-bold tabular-nums">{formatPkr(item.amount)}</dd>
        </div>
        <div className="rounded-lg bg-white p-2">
          <dt className="text-[#667085]">Returned</dt>
          <dd className="mt-0.5 font-bold tabular-nums text-[#067647]">{formatPkr(item.recovered)}</dd>
        </div>
        <div className="rounded-lg bg-white p-2">
          <dt className="text-[#667085]">Agency cost</dt>
          <dd className="mt-0.5 font-bold tabular-nums">{formatPkr(remaining)}</dd>
        </div>
      </dl>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E4E7EC]" role="progressbar" aria-label="Share of expense returned" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-[#12B76A]" style={{ width: `${percent}%` }} />
      </div>
      {item.status !== "approved" && <p className="mt-3 text-xs text-[#667085]">Approve this expense before recording money returned against it.</p>}
      {item.recoveries.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-white">
          {item.recoveries.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className={`font-semibold ${row.status === "reversed" ? "text-[#98A2B3] line-through" : ""}`}>
                  {formatPkr(row.amount)} from {sources.find((source) => source.value === row.source)?.label.toLowerCase() ?? row.source}
                </p>
                <p className="text-xs text-[#667085]">
                  {row.receivedOn} · {row.method}
                  {row.reference && ` · ${row.reference}`}
                  {row.note && ` · ${row.note}`}
                  {row.status === "reversed" && " · reversed"}
                </p>
              </div>
              {row.status === "posted" && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReversing(row)} aria-label={`Reverse ${row.id}`}>
                  <Undo2 size={15} />
                  Reverse
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-3 grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2">
          <FormInput
            label="Amount returned (PKR)"
            type="number"
            min={1}
            max={remaining}
            required
            value={form.amount || ""}
            error={amountError ?? errors.amount}
            onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
          />
          <FormInput
            label="Date returned"
            type="date"
            required
            min={item.occurredOn}
            value={form.receivedOn}
            error={form.receivedOn && form.receivedOn < item.occurredOn ? "Use a date on or after the expense." : errors.receivedOn}
            onChange={(event) => setForm({ ...form, receivedOn: event.target.value })}
          />
          <FormSelect label="Returned by" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} options={sources} />
          <FormSelect label="Method" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} options={methods} />
          <FormInput label="Reference" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} hint="Optional receipt or transfer number" />
          <FormInput label="Note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} hint="Optional" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!valid || pending} onClick={save}>
              {pending ? "Saving…" : "Save return"}
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && setReversing(undefined)}
        title={`Reverse ${reversing ? formatPkr(reversing.amount) : "this return"}?`}
        description="The return stays on record as reversed and the amount counts as an agency expense again in ledgers."
        onConfirm={reverse}
        pending={pending}
        confirmLabel="Reverse return"
        pendingLabel="Reversing…"
      />
    </section>
  );
}

function blank(item: ExpenseDto) {
  const remaining = item.amount - item.recovered;
  const today = todayInPakistan();
  return { amount: remaining, receivedOn: today < item.occurredOn ? item.occurredOn : today, source: item.customerId ? "customer" : "other", method: "Cash", reference: "", note: "" };
}
