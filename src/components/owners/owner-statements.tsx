"use client";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { Banknote, History, X } from "lucide-react";
import { recordOwnerPayoutAction } from "@/app/actions/owners";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPkr } from "@/lib/utils";
import type { OwnerDetailDto, OwnerStatementDto, OwnerStatementLine } from "@/server/services/owner-service";
export function OwnerStatements({ owner, canPay, onChange }: { owner: OwnerDetailDto; canPay: boolean; onChange: (owner: OwnerDetailDto) => void }) {
  const defaultStatement = owner.statements.find((item) => item.closing > 0) ?? owner.statements[0];
  const [selectedId, setSelected] = useState(defaultStatement?.id);
  const [paying, setPaying] = useState(false);
  const selected = owner.statements.find((x) => x.id === selectedId) ?? owner.statements.find((item) => item.closing > 0) ?? owner.statements[0];
  if (!selected)
    return <EmptyState title="No statement activity" description="Completed managed rentals, approved owner expenses, and payouts will appear here." />;
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="font-bold">Owner ledger</h2>
            <p className="mt-1 text-xs text-[#667085]">
              Owner share of each completed rental (dated by booking start), the owner’s part of vehicle expenses and fixed charges, and posted payouts. The
              balance carries forward month to month like a bank statement.
            </p>
          </div>
          <select value={selected.id} onChange={(e) => setSelected(e.target.value)} className="h-10 rounded-lg border px-3 text-sm">
            {owner.statements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.period} · {s.status}
              </option>
            ))}
          </select>
          <Link className="text-sm font-semibold text-[#006FE6]" href={`/reports?tab=Ledger&scope=owner&ownerId=${encodeURIComponent(owner.id)}`}>
            View full owner ledger
          </Link>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Opening balance", selected.openingBalance],
          ["Owner share earned", selected.rentalRevenue],
          ["Owner's expenses", -selected.expenses],
          ["Payouts", -selected.payouts],
          ["Closing balance", selected.closingBalance],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-[#667085]">{label}</p>
            <p className="mt-2 text-lg font-bold">{formatPkr(value as number)}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">{selected.period}</h3>
              <StatusBadge status={selected.status} />
            </div>
          </div>
          {canPay && selected.closing > 0 && (
            <Button size="sm" onClick={() => setPaying(true)}>
              <Banknote size={15} />
              Record payout
            </Button>
          )}
        </div>
        {selected.lines.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-[#F8FAFC] text-xs text-[#667085]">
                  <tr>
                    {["Booking date", "Car number", "Details", "Expense head", "Income", "Expense", "Paid", "Balance"].map((label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t bg-[#F8FAFC]">
                    <td className="p-3 font-semibold" colSpan={7}>
                      Opening balance brought forward
                    </td>
                    <td className="p-3 font-semibold">{formatPkr(selected.openingBalance)}</td>
                  </tr>
                  {selected.lines.map((line) => (
                    <tr key={line.id} className="border-t align-top">
                      <td className="whitespace-nowrap p-3">{formatDateTime(line.date.slice(0, 10))}</td>
                      <td className="p-3 font-semibold">{line.plate ?? "Owner account"}</td>
                      <td className="p-3">
                        <strong className="text-xs">{lineTitle(line)}</strong>
                        <p className="mt-1 max-w-[260px] text-xs text-[#667085]">{lineNote(line)}</p>
                      </td>
                      <td className="p-3 text-xs">{line.head ?? "—"}</td>
                      <td className="whitespace-nowrap p-3 text-[#067647]">{line.kind === "Rental revenue" ? formatPkr(line.amount) : "—"}</td>
                      <td className="whitespace-nowrap p-3 text-[#B42318]">
                        {line.kind === "Owner expense" || line.kind === "Fixed charge" ? formatPkr(-line.amount) : "—"}
                      </td>
                      <td className="whitespace-nowrap p-3">{line.kind === "Payout" ? formatPkr(-line.amount) : "—"}</td>
                      <td className="whitespace-nowrap p-3 font-semibold">{formatPkr(line.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              <div className="flex justify-between p-4 text-sm font-semibold">
                <span>Opening balance</span>
                <span>{formatPkr(selected.openingBalance)}</span>
              </div>
              {selected.lines.map((line) => (
                <article key={line.id} className="p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <strong>
                      {line.plate ?? "Owner account"} · {lineTitle(line)}
                    </strong>
                    <strong className={line.amount < 0 ? "text-[#B42318]" : "text-[#067647]"}>{formatPkr(line.amount)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-[#667085]">
                    {formatDateTime(line.date.slice(0, 10))} · {lineNote(line)}
                  </p>
                  <p className="mt-1 text-xs">
                    Balance <strong>{formatPkr(line.balance)}</strong>
                  </p>
                </article>
              ))}
            </div>
            <details className="border-t p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#006FE6]">Full ledger details</summary>
              <div className="mt-3 divide-y rounded-lg border">
                {selected.lines.map((line) => (
                  <div key={line.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:justify-between">
                    <div>
                      <strong>{line.kind}</strong>
                      <p className="text-xs text-[#667085]">
                        {line.description} · {line.source} · {line.agreementVersion}
                      </p>
                    </div>
                    <strong className="tabular-nums">{formatPkr(line.amount)}</strong>
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-[#667085]">No financial activity in this period.</p>
        )}
        <div className="border-t bg-[#F8FAFC] p-4 text-right text-sm">
          <span className="text-[#667085]">Closing balance </span>
          <strong className="ml-3 text-lg">{formatPkr(selected.closingBalance)}</strong>
        </div>
      </section>
      <PayoutHistory owner={owner} />
      {paying && (
        <PayoutDialog
          owner={owner}
          statement={selected}
          onClose={() => setPaying(false)}
          onSave={(next) => {
            onChange(next);
            setPaying(false);
          }}
        />
      )}
    </div>
  );
}

function PayoutHistory({ owner }: { owner: OwnerDetailDto }) {
  return (
    <section className="rounded-xl border bg-white">
      <div className="flex items-center gap-2 border-b p-4">
        <History size={17} className="text-[#006FE6]" />
        <div>
          <h3 className="font-bold">Owner payment history</h3>
          <p className="mt-0.5 text-xs text-[#667085]">Permanent record of posted owner payouts, linked vehicles, methods, and references.</p>
        </div>
      </div>
      {owner.payoutHistory.length ? (
        <div className="divide-y">
          {owner.payoutHistory.map((item) => (
            <article key={item.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div>
                <strong>{item.reference}</strong>
                <p className="mt-1 text-xs text-[#667085]">
                  {item.plate ?? "Historical payout · vehicle not allocated"} · {item.method.replaceAll("_", " ")} ·
                  statement {item.periodFrom} to {item.periodTo}
                </p>
              </div>
              <span className="text-xs text-[#667085]">Paid {formatDateTime(item.paidAt)}</span>
              <strong className="tabular-nums text-[#067647]">{formatPkr(item.amount)}</strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="p-8 text-center text-sm text-[#667085]">No owner payments have been posted yet.</p>
      )}
    </section>
  );
}

function lineTitle(line: OwnerStatementLine) {
  if (line.kind === "Rental revenue") return `Rental share · ${line.source}`;
  if (line.kind === "Payout") return `Payout · ${line.source}`;
  return line.kind === "Fixed charge" ? "Fixed charge" : "Expense";
}
function lineNote(line: OwnerStatementLine) {
  if (line.kind === "Rental revenue")
    return line.rentalFrom && line.rentalTo
      ? `${formatDateTime(line.rentalFrom.slice(0, 10))} – ${formatDateTime(line.rentalTo.slice(0, 10))} · ${line.days} ${line.days === 1 ? "day" : "days"}`
      : `${line.days} rental days`;
  return line.description;
}
function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined, timeZone: "Asia/Karachi" }).format(
    parsed,
  );
}
function PayoutDialog({
  owner,
  statement,
  onClose,
  onSave,
}: {
  owner: OwnerDetailDto;
  statement: OwnerStatementDto;
  onClose: () => void;
  onSave: (owner: OwnerDetailDto) => void;
}) {
  const [vehicleId, setVehicleId] = useState(owner.vehicles[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const vehicle = owner.vehicles.find((item) => item.id === vehicleId);
  const vehicleLines = statement.lines.filter((line) => line.vehicleId === vehicleId);
  const earned = vehicleLines.filter((line) => line.kind === "Rental revenue").reduce((sum, line) => sum + line.amount, 0);
  const expenses = -vehicleLines.filter((line) => line.kind === "Owner expense" || line.kind === "Fixed charge").reduce((sum, line) => sum + line.amount, 0);
  const paid = -vehicleLines.filter((line) => line.kind === "Payout").reduce((sum, line) => sum + line.amount, 0);
  const vehiclePayable = earned - expenses - paid;
  const valid =
    Boolean(vehicleId) && Number.isInteger(amount) && amount > 0 && amount <= statement.closing && amount <= vehiclePayable && Boolean(reference.trim());
  function submit() {
    if (!valid || pending) return;
    setError("");
    startTransition(async () => {
      const result = await recordOwnerPayoutAction(owner.id, {
        vehicleId,
        periodFrom: statement.periodFrom,
        periodTo: statement.periodTo,
        amount,
        method,
        reference,
        idempotencyKey,
      });
      if (result.ok) onSave(result.data);
      else setError(result.error.message);
    });
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !pending && !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex justify-between">
            <div>
              <Dialog.Title className="font-bold">Record owner payout</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#667085]">
                Available payable: {formatPkr(statement.closing)}. Every payment must identify the managed car it belongs to.
              </Dialog.Description>
            </div>
            <Dialog.Close disabled={pending} aria-label="Close dialog" className="grid h-10 w-10 place-items-center rounded-lg disabled:opacity-50">
              <X />
            </Dialog.Close>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormSelect
              label="Managed vehicle"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setAmount(0);
              }}
              options={owner.vehicles.map((vehicle) => ({ label: `${vehicle.name} · ${vehicle.plate}`, value: vehicle.id }))}
            />
            <FormInput
              label="Amount"
              type="number"
              min={1}
              max={Math.max(0, vehiclePayable)}
              value={amount || ""}
              error={amount > vehiclePayable ? `Maximum for this vehicle is ${formatPkr(vehiclePayable)}.` : undefined}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <div className="rounded-lg border bg-[#F8FAFC] p-3 text-sm sm:col-span-2">
              <strong>{vehicle?.plate ?? "Select vehicle"}</strong>
              <p className="mt-1 text-[#475467]">
                Owner share earned {formatPkr(earned)} · owner expenses {formatPkr(expenses)} · paid {formatPkr(paid)}
              </p>
              <p className="mt-1 font-bold">Available for this vehicle: {formatPkr(vehiclePayable)}</p>
            </div>
            <FormSelect
              label="Method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              options={[
                { label: "Bank transfer", value: "bank_transfer" },
                { label: "Cheque", value: "cheque" },
                { label: "Cash", value: "cash" },
              ]}
            />
            <FormInput label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} required />
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!valid || pending} onClick={submit}>
              {pending ? "Posting…" : "Record payout"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
