import { formatPkr } from "@/lib/utils";
import type { OwnerCarLedger, OwnerLedgerRow } from "@/lib/reports/ledger";

/**
 * One car's owner statement laid out like the paper sheet owners already keep:
 * a totals band (Total rent · agency share · Debit · Total · Remaining · Grand) above
 * dated rows of Customer / Description / Rent / Cash out / Meter / Remaining.
 * Cars are identified by number plate only.
 */
export function OwnerCarSheet({ car, period }: { car: OwnerCarLedger; period: string }) {
  const totals: Array<{ label: string; value: number; note: string; tone?: "debit" | "grand" }> = [
    { label: "Total rent", value: car.rent, note: `${car.trips} ${car.trips === 1 ? "trip" : "trips"} · ${car.days} ${car.days === 1 ? "day" : "days"}` },
    { label: car.agencyPercent !== null ? `${formatPercent(car.agencyPercent)} agency share` : "Agency share", value: car.agencyShare, note: `Owner share ${formatPkr(car.income)}` },
    { label: "Debit", value: car.debit, note: car.paid ? `Includes ${formatPkr(car.paid)} paid to owner` : "Expenses and charges", tone: "debit" },
    { label: "Total", value: car.net, note: "Owner share − debit" },
    { label: "Remaining", value: car.opening, note: "Brought forward" },
    { label: "Grand", value: car.closing, note: "Remaining + total", tone: "grand" },
  ];
  const cashOut = car.rows.reduce((sum, row) => sum + row.expense + row.paid, 0);
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#667085]">By car</p>
          <h3 className="mt-0.5 text-xl font-bold tabular-nums">{car.plate}</h3>
        </div>
        <p className="text-sm text-[#475467]">{period}</p>
      </header>
      <dl className="grid grid-cols-2 border-b sm:grid-cols-3 lg:grid-cols-6">
        {totals.map((item) => (
          <div
            key={item.label}
            className={`border-b border-r p-3 last:border-r-0 lg:border-b-0 ${item.tone === "grand" ? "bg-[#EAF4FF]" : item.tone === "debit" ? "bg-[#FEF3F2]" : ""}`}
          >
            <dt className="text-xs font-semibold text-[#475467]">{item.label}</dt>
            <dd className={`mt-1 text-lg font-bold tabular-nums ${item.tone === "debit" ? "text-[#B42318]" : item.value < 0 ? "text-[#B42318]" : "text-[#19191F]"}`}>
              {formatPkr(item.value)}
            </dd>
            <p className="mt-0.5 text-[11px] text-[#667085]">{item.note}</p>
          </div>
        ))}
      </dl>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#F8FAFC] text-xs text-[#475467]">
            <tr>
              <th className="p-3 font-semibold">Date</th>
              <th className="p-3 font-semibold">Customer</th>
              <th className="p-3 font-semibold">Description</th>
              <th className="p-3 text-right font-semibold">Rent</th>
              <th className="bg-[#FEF3F2] p-3 text-right font-semibold text-[#B42318]">Cash out</th>
              <th className="p-3 text-right font-semibold">Meter</th>
              <th className="bg-[#FFF6ED] p-3 text-right font-semibold text-[#B93815]">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {car.opening === 0 && !car.rows.some((row) => row.kind === "Opening balance") && (
              <tr className="border-t bg-[#F8FAFC] text-[#475467]">
                <td className="p-3" colSpan={6}>
                  Opening balance
                </td>
                <td className="p-3 text-right font-semibold tabular-nums">{formatPkr(0)}</td>
              </tr>
            )}
            {car.rows.map((row) => {
              const text = describe(row);
              return (
                <tr key={row.id} className={`border-t align-top ${row.kind === "Opening balance" ? "bg-[#F8FAFC]" : ""}`}>
                  <td className="whitespace-nowrap p-3 tabular-nums">{formatDate(row.date)}</td>
                  <td className="p-3">{row.customer ?? ""}</td>
                  <td className="p-3">
                    <span className={row.kind === "Opening balance" ? "font-semibold" : ""}>{text.title}</span>
                    {text.note && <p className="mt-0.5 max-w-[300px] text-xs text-[#667085]">{text.note}</p>}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right tabular-nums">
                    {row.rent ? (
                      <>
                        <span className="font-semibold">{number(row.rent)}</span>
                        <p className="text-[11px] text-[#067647]">Owner {number(row.income)}</p>
                      </>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="whitespace-nowrap bg-[#FFFBFA] p-3 text-right font-semibold tabular-nums">{cashOutText(row)}</td>
                  <td className="whitespace-nowrap p-3 text-right tabular-nums text-[#475467]">{row.meter ? number(row.meter) : ""}</td>
                  <td className={`whitespace-nowrap bg-[#FFFCF5] p-3 text-right tabular-nums ${row.kind === "Opening balance" ? "font-bold" : "text-[#667085]"}`}>
                    {number(row.balance, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-[#D0D5DD] bg-[#EAF4FF] font-bold">
            <tr>
              <td className="p-3" colSpan={3}>
                Grand total
              </td>
              <td className="p-3 text-right tabular-nums">{number(car.rent)}</td>
              <td className="p-3 text-right tabular-nums text-[#B42318]">{number(cashOut)}</td>
              <td className="p-3" />
              <td className="p-3 text-right tabular-nums">{number(car.closing, true)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="divide-y md:hidden">
        {car.rows.map((row) => {
          const text = describe(row);
          const out = cashOutText(row);
          return (
            <li key={row.id} className="p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[#667085]">
                    {formatDate(row.date)}
                    {row.customer ? ` · ${row.customer}` : ""}
                  </p>
                  <p className="mt-0.5 font-semibold">{text.title}</p>
                  {text.note && <p className="mt-0.5 text-xs text-[#667085]">{text.note}</p>}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {row.rent ? <p className="font-bold">{number(row.rent)}</p> : null}
                  {out ? <p className="font-bold text-[#B42318]">{out}</p> : null}
                  {row.meter ? <p className="text-xs text-[#667085]">Meter {number(row.meter)}</p> : null}
                </div>
              </div>
              <p className="mt-2 text-xs text-[#667085]">
                Remaining <strong className="text-[#19191F]">{formatPkr(row.balance)}</strong>
              </p>
            </li>
          );
        })}
        <li className="flex justify-between bg-[#EAF4FF] p-4 text-sm font-bold">
          <span>Grand</span>
          <span className="tabular-nums">{formatPkr(car.closing)}</span>
        </li>
      </ul>
    </section>
  );
}

function describe(row: OwnerLedgerRow): { title: string; note: string } {
  if (row.kind === "Opening balance") return { title: "Opening balance", note: "" };
  if (row.kind === "Rental share")
    return {
      title: row.destination && row.destination !== "Not recorded" ? row.destination : "Local",
      note: `${row.reference} · ${row.days} ${row.days === 1 ? "day" : "days"}`,
    };
  if (row.kind === "Payout") return { title: "Paid to owner", note: `${row.reference} · ${row.description}` };
  if (row.kind === "Recovery") return { title: `${row.head ?? "Expense"} returned`, note: row.description };
  if (row.kind === "Fixed charge") return { title: row.head ?? "Fixed charge", note: "Monthly fixed charge" };
  return { title: row.head ?? "Expense", note: cleanExpense(row.description, row.head) };
}

function cashOutText(row: OwnerLedgerRow) {
  const value = row.expense + row.paid;
  if (!value) return "";
  return value < 0 ? `(${number(value)})` : number(value);
}

export function cleanExpense(value: string, head: string | null) {
  return (head && value.startsWith(`${head} - `) ? value.slice(head.length + 3) : value)
    .replace(/\s*·\s*owner pays.*$/i, "")
    .replace(/\s*·\s*recurring/i, " (recurring)");
}

function number(value: number, signed = false) {
  return `${signed && value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("en-PK")}`;
}

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}
