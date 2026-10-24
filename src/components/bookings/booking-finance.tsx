"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { CreditCard, FileText, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import {
  recordBookingDepositAction,
  recordBookingPaymentAction,
  reverseBookingTransactionAction,
} from "@/app/actions/bookings";
import type { BookingListItem, BookingTransactionDto } from "@/server/repositories/contracts";
import type { DepositAction, PaymentMethod } from "@/server/validation/booking";
import { formatPkr } from "@/lib/utils";
import { formatPaymentReceiptNumber } from "@/lib/payment-receipt";

export type BookingDetailData = BookingListItem & {
  paymentReceiptNumber?: number | null;
  transactions?: BookingTransactionDto[];
  depositHeld?: number;
  inspections?: unknown[];
};

interface BookingFinanceProps {
  bookingId: string;
  customer: string;
  balance: number;
  depositHeld?: number;
  transactions?: BookingTransactionDto[];
  onChanged: (updatedBooking: BookingDetailData, message: string) => void;
  purpose?: "default" | "settlement";
}

export function BookingFinance({
  bookingId,
  customer,
  balance,
  depositHeld = 0,
  transactions = [],
  onChanged,
  purpose = "default",
}: BookingFinanceProps) {
  const [mode, setMode] = useState<"payment" | "deposit" | "ledger">();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMode("ledger")}>
          <FileText size={15} />
          {purpose === "settlement" ? "Review payments" : "Ledger"}
        </Button>
        {(purpose === "default" || depositHeld > 0) && <Button size="sm" variant="secondary" onClick={() => setMode("deposit")}>
          <RotateCcw size={15} />
          {purpose === "settlement" ? `Refund deposit · ${formatPkr(depositHeld)}` : "Manage deposit"}
        </Button>}
        {purpose === "default" && <Button size="sm" onClick={() => setMode("payment")}>
          <CreditCard size={15} />
          Record payment
        </Button>}
      </div>

      {mode === "payment" && (
        <PaymentDialog
          bookingId={bookingId}
          customer={customer}
          balance={balance}
          onClose={() => setMode(undefined)}
          onSave={(updated, message) => {
            setMode(undefined);
            onChanged(updated, message);
          }}
        />
      )}

      {mode === "deposit" && (
        <DepositDialog
          bookingId={bookingId}
          customer={customer}
          depositHeld={depositHeld}
          onClose={() => setMode(undefined)}
          onSaved={(updated, message) => {
            setMode(undefined);
            onChanged(updated, message);
          }}
        />
      )}

      {mode === "ledger" && (
        <LedgerDialog
          bookingId={bookingId}
          transactions={transactions}
          settlementMode={purpose === "settlement"}
          onClose={() => setMode(undefined)}
          onChanged={(updated, message) => {
            onChanged(updated, message);
          }}
        />
      )}
    </>
  );
}

function Shell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex justify-between">
            <div>
              <Dialog.Title className="font-bold">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#667085]">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 place-items-center rounded-lg">
              <X />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaymentDialog({
  bookingId,
  customer,
  balance,
  onClose,
  onSave,
}: {
  bookingId: string;
  customer: string;
  balance: number;
  onClose: () => void;
  onSave: (updated: BookingDetailData, message: string) => void;
}) {
  const [amount, setAmount] = useState(Math.max(0, balance));
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [reference, setReference] = useState("");
  const [account, setAccount] = useState("Lahore cash drawer");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const valid = Number.isInteger(amount) && amount > 0;
  const creditAmount = valid ? amount - Math.max(balance, 0) : 0;

  async function save() {
    if (!valid || pending) return;
    setPending(true);
    setError("");
    const result = await recordBookingPaymentAction(bookingId, {
      amount,
      method,
      reference: reference.trim(),
      account,
    });
    setPending(false);
    if (result.ok) {
      const receiptId = result.data.paymentReceiptNumber === null
        ? ""
        : formatPaymentReceiptNumber(result.data.paymentReceiptNumber);
      onSave(result.data, `Payment posted${receiptId ? ` as ${receiptId}` : ""}. ${result.data.notificationDelivery.message}`);
    } else {
      setError(result.error.message || "Failed to record payment.");
    }
  }

  return (
    <Shell
      title="Record payment"
      description={`Record payment for ${customer}. A unique receipt ID is generated automatically.`}
      onClose={onClose}
    >
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormInput
          label="Amount (PKR)"
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <FormSelect
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          options={["Cash", "Bank transfer", "Card terminal", "JazzCash", "Easypaisa", "Other wallet"]}
        />
        <FormInput
          label="External reference (optional)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. IBFT-90418"
        />
        <FormSelect
          label="Receiving account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          options={["Lahore cash drawer", "HBL Operations", "Meezan Operations", "Counter"]}
        />
      </div>

      {creditAmount > 0 && (
        <p role="status" className="mt-3 rounded-lg border border-[#B2DDFF] bg-[#F5FAFF] p-3 text-xs text-[#175CD3]">
          {formatPkr(creditAmount)} more than the {balance > 0 ? `outstanding balance of ${formatPkr(balance)}` : "booking total"} will be held as credit for {customer}. Refund it from Finance if they want it back.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#FEF3F2] p-3 text-xs text-[#B42318]">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!valid || pending} onClick={() => void save()}>
          {pending ? "Posting…" : "Post payment"}
        </Button>
      </div>
    </Shell>
  );
}

function DepositDialog({
  bookingId,
  customer,
  depositHeld,
  onClose,
  onSaved,
}: {
  bookingId: string;
  customer: string;
  depositHeld: number;
  onClose: () => void;
  onSaved: (updated: BookingDetailData, message: string) => void;
}) {
  const [action, setAction] = useState<DepositAction>(depositHeld > 0 ? "Deposit refunded" : "Deposit received");
  const [amount, setAmount] = useState(depositHeld || 10000);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const isOut = ["Deposit applied", "Deposit refunded", "Deposit forfeited"].includes(action);
  const valid = Number.isInteger(amount) && amount > 0 && (!isOut || amount <= depositHeld);

  async function save() {
    if (!valid || !reason.trim() || pending) return;
    setPending(true);
    setError("");
    const result = await recordBookingDepositAction(bookingId, {
      action,
      amount,
      reference: reason.trim(),
    });
    setPending(false);
    if (result.ok) {
      onSaved(result.data, `${action} transaction posted.`);
    } else {
      setError(result.error.message || "Failed to record deposit.");
    }
  }

  return (
    <Shell
      title="Manage deposit"
      description={`Customer: ${customer} · Currently held: ${formatPkr(depositHeld)}. Deposits remain liabilities until explicitly resolved.`}
      onClose={onClose}
    >
      <div className="mt-5 space-y-4">
        <FormSelect
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value as DepositAction)}
          options={["Deposit received", "Deposit applied", "Deposit refunded", "Deposit forfeited"]}
        />
        <FormInput
          label="Amount (PKR)"
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <FormInput
          label="Reason / reference"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Security deposit token, returned undamaged"
          required
        />
        {isOut && amount > depositHeld && (
          <p className="text-xs text-[#B42318]">Amount cannot exceed the held deposit.</p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-[#FEF3F2] p-3 text-xs text-[#B42318]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || !reason.trim() || pending} onClick={() => void save()}>
            {pending ? "Posting…" : "Post transaction"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function LedgerDialog({
  bookingId,
  transactions,
  onClose,
  onChanged,
  settlementMode = false,
}: {
  bookingId: string;
  transactions: BookingTransactionDto[];
  onClose: () => void;
  onChanged: (updated: BookingDetailData, message: string) => void;
  settlementMode?: boolean;
}) {
  const [selectedTxn, setSelectedTxn] = useState<string | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"reversal" | "refund">("reversal");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function compensate(transactionId: string) {
    if (!reason.trim() || pending) return;
    setPending(true);
    setError("");
    const result = await reverseBookingTransactionAction(bookingId, {
      transactionId,
      reason: reason.trim(),
      adjustmentType,
    });
    setPending(false);
    if (result.ok) {
      setSelectedTxn(null);
      setReason("");
      onChanged(result.data, adjustmentType === "refund" ? "Customer refund posted and linked to the original transaction." : "Reversal posted as a linked correction.");
    } else {
      setError(result.error.message || "Failed to reverse transaction.");
    }
  }

  return (
    <Shell
      title="Transaction ledger"
      description={settlementMode ? "Refund money returned to the customer, or reverse an entry that was posted by mistake." : "Every transaction and correction is recorded and permanently auditable."}
      onClose={onClose}
    >
      <div className="mt-5 space-y-3">
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#667085]">
            No financial transactions recorded for this booking yet.
          </p>
        ) : (
          transactions.map((item) => {
            const kind = item.kind.toLowerCase();
            const isNegative = ["reversal", "refund", "payment_adjustment_decrease", "price_adjustment_decrease"].includes(kind);
            const canAdjust = item.status === "posted" && ["payment", "late_return_charge", "deposit_applied"].includes(kind);
            const original = item.linkedTransactionId
              ? transactions.find((transaction) => transaction.id === item.linkedTransactionId)
              : undefined;
            return (
              <div key={item.id} className="rounded-lg border border-[#E8ECF2] p-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm capitalize">{item.kind.replaceAll("_", " ")}</strong>
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          ["reversed", "refunded"].includes(item.status)
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#667085]">
                      {item.receiptNumber ? `${formatPaymentReceiptNumber(item.receiptNumber)} · ` : ""}{item.method}
                    </p>
                    {item.reference && <p className="mt-1 text-xs text-[#475467]">{isNegative ? "Reason" : "Reference"}: {item.reference}</p>}
                    {original && (
                      <p className="mt-1 text-[11px] font-medium text-[#667085]">
                        Linked to {original.receiptNumber ? formatPaymentReceiptNumber(original.receiptNumber) : original.id} · {original.kind.replaceAll("_", " ")} · {formatPkr(original.amount)}
                      </p>
                    )}
                    <p className="text-[11px] text-[#98A2B3]">
                      {new Intl.DateTimeFormat("en-PK", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.postedAt))}
                    </p>
                  </div>
                  <strong className={`text-sm ${isNegative ? "text-[#B42318]" : "text-[#067647]"}`}>
                    {isNegative ? "-" : "+"}
                    {formatPkr(item.amount)}
                  </strong>
                </div>

                {canAdjust && (
                  <div className="mt-3 border-t border-[#F2F4F7] pt-2">
                    {selectedTxn === item.id ? (
                      <div className="space-y-2">
                        <FormInput
                          label={adjustmentType === "refund" ? "Refund reason / reference" : "Correction reason"}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={adjustmentType === "refund" ? "e.g. Booking cancelled, bank transfer returned" : "State why this entry was posted incorrectly..."}
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedTxn(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!reason.trim() || pending}
                            onClick={() => void compensate(item.id)}
                          >
                            {pending ? (adjustmentType === "refund" ? "Refunding…" : "Reversing…") : (adjustmentType === "refund" ? "Confirm refund" : "Confirm reversal")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => {setSelectedTxn(item.id);setAdjustmentType("refund");setReason("");setError("")}}>Refund customer</Button>
                        <Button size="sm" variant="ghost" onClick={() => {setSelectedTxn(item.id);setAdjustmentType("reversal");setReason("");setError("")}}>Reverse error</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-[#FEF3F2] p-3 text-xs text-[#B42318]">
            {error}
          </p>
        )}
      </div>
    </Shell>
  );
}
