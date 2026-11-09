import Link from "next/link";
import { formatPkr } from "@/lib/utils";
import type { AccountExpense, AccountSummary } from "@/lib/reports/account-summary";

export type SummaryCard = { label: string; value: number; note: string; tone?: "red" | "green" | "net" };

/** Row of money cards shared by customer, driver, owner, and agency ledgers. */
export function SummaryCards({ cards, compact = false }: { cards: SummaryCard[]; compact?: boolean }) {
  if (compact)
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="flex justify-between gap-2 sm:block">
            <dt className="text-[#667085]">{card.label}</dt>
            <dd className={`font-semibold tabular-nums ${tone(card)}`}>{formatPkr(card.value)}</dd>
          </div>
        ))}
      </dl>
    );
  return (
    <dl className={`grid grid-cols-2 gap-3 ${cards.length >= 6 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
      {cards.map((card) => (
        <div key={card.label} className={`rounded-xl border p-4 ${card.tone === "net" ? "border-[#B2DDFF] bg-[#EFF8FF]" : "bg-white"}`}>
          <dt className="text-xs text-[#667085]">{card.label}</dt>
          <dd className={`mt-2 text-lg font-bold tabular-nums ${tone(card)}`}>{formatPkr(card.value)}</dd>
          <p className="mt-1 text-xs text-[#667085]">{card.note}</p>
        </div>
      ))}
    </dl>
  );
}

/** Income / expense summary for a customer or driver account: rent, received, expenses, returned, net. */
export function AccountSummaryCards({ summary, compact = false }: { summary: AccountSummary; compact?: boolean }) {
  return (
    <SummaryCards
      compact={compact}
      cards={[
        { label: "Rent", value: summary.rent, note: "Charged on bookings" },
        { label: "Received", value: summary.received, note: summary.rent > summary.received ? `${formatPkr(summary.rent - summary.received)} still due` : "Fully received" },
        { label: "Expenses", value: summary.expenses, note: "Approved, linked costs", tone: "red" },
        { label: "Returned", value: summary.recovered, note: summary.expenses ? `${formatPkr(summary.netExpense)} unrecovered` : "Nothing to recover", tone: "green" },
        { label: "Net income", value: summary.net, note: "Received − unrecovered expenses", tone: "net" },
      ]}
    />
  );
}

function tone(card: SummaryCard) {
  if (card.tone === "red" && card.value) return "text-[#B42318]";
  if (card.tone === "green" && card.value) return "text-[#067647]";
  return card.value < 0 ? "text-[#B42318]" : "";
}

/** Approved expenses on the account with what was returned, so open recoveries are easy to chase. */
export function AccountExpenseList({ expenses, emptyText }: { expenses: AccountExpense[]; emptyText: string }) {
  if (!expenses.length) return <p className="text-sm text-[#667085]">{emptyText}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {expenses.map((row) => {
        const open = row.amount - row.recovered;
        return (
          <li key={row.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">
                {row.head}
                {row.plate ? <span className="font-normal text-[#667085]"> · {row.plate}</span> : null}
              </p>
              <p className="text-xs text-[#667085]">
                {row.date} · {row.description} ·{" "}
                <Link href={`/expenses?q=${encodeURIComponent(row.id)}`} className="font-semibold text-[#006FE6]">
                  {row.id}
                </Link>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
              <span>
                Expense <strong>{formatPkr(row.amount)}</strong>
              </span>
              <span className="text-[#067647]">Returned {formatPkr(row.recovered)}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${!open ? "bg-[#ECFDF3] text-[#067647]" : row.recovered ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#F2F4F7] text-[#475467]"}`}>
                {!open ? "Fully returned" : row.recovered ? `${formatPkr(open)} still open` : "Not returned"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
