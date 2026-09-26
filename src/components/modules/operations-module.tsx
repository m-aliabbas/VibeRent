"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  FileText,
  Plus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/shared/toast";
import { bookings, customers, expenses, owners } from "@/lib/operations-data";
import { formatPkr } from "@/lib/utils";

type ModuleName = "bookings" | "customers" | "expenses" | "reports" | "owners";
const config = {
  bookings: {
    eyebrow: "Rental operations",
    title: "Bookings",
    description:
      "Manage reservations, handovers, returns, and booking balances.",
    action: "New booking",
    icon: CalendarDays,
  },
  customers: {
    eyebrow: "Customer records",
    title: "Customers",
    description: "Review renter profiles, history, and operational warnings.",
    action: "Add customer",
    icon: UsersRound,
  },
  expenses: {
    eyebrow: "Fleet finance",
    title: "Expenses",
    description: "Track vehicle costs, receipts, and allocation categories.",
    action: "Add expense",
    icon: WalletCards,
  },
  reports: {
    eyebrow: "Performance",
    title: "Reports",
    description:
      "Understand fleet profitability, utilization, and collections.",
    action: "Export report",
    icon: BarChart3,
  },
  owners: {
    eyebrow: "Managed fleet",
    title: "Owners",
    description:
      "Review managed vehicles, revenue shares, and payout balances.",
    action: "Add owner",
    icon: UsersRound,
  },
} as const;

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8ECF2] bg-white p-4">
      <p className="text-xs font-medium text-[#667085]">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[#667085]">{note}</p>
    </div>
  );
}

export function OperationsModule({ module }: { module: ModuleName }) {
  const meta = config[module];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const term = search.toLowerCase().trim();
  const rows = useMemo(() => {
    const source =
      module === "bookings"
        ? bookings
        : module === "customers"
          ? customers
          : module === "expenses"
            ? expenses
            : module === "owners"
              ? owners
              : [];
    return source.filter(
      (row) =>
        JSON.stringify(row).toLowerCase().includes(term) &&
        (filter === "All" || Object.values(row).includes(filter as never)),
    );
  }, [module, term, filter]);
  if (module === "reports")
    return <Reports notice={notice} setNotice={setNotice} />;
  const filterOptions =
    module === "bookings"
      ? ["Confirmed", "Checked Out", "Completed", "Cancelled"]
      : module === "customers"
        ? ["Active", "Preferred", "Review"]
        : module === "expenses"
          ? ["Fuel", "Cleaning", "Maintenance", "Insurance"]
          : ["Active", "Due", "Settled"];
  return (
    <div className="space-y-6">
      <Toast message={notice} onDismiss={() => setNotice("")} />
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        actions={
          <Button
            onClick={() =>
              setNotice(`${meta.action} prototype opened successfully.`)
            }
          >
            <Plus size={17} />
            {meta.action}
          </Button>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {module === "bookings" ? (
          <>
            <Metric label="Active rentals" value="3" note="2 return today" />
            <Metric label="Confirmed" value="7" note="Next 7 days" />
            <Metric
              label="Booking value"
              value={formatPkr(428500)}
              note="September"
            />
            <Metric
              label="Outstanding"
              value={formatPkr(46500)}
              note="4 balances"
            />
          </>
        ) : module === "customers" ? (
          <>
            <Metric label="Customers" value="218" note="12 added this month" />
            <Metric label="Repeat renters" value="42%" note="Last 90 days" />
            <Metric label="Preferred" value="31" note="High-value profiles" />
            <Metric
              label="Needs review"
              value="3"
              note="Operational warnings"
            />
          </>
        ) : module === "expenses" ? (
          <>
            <Metric
              label="September spend"
              value={formatPkr(184900)}
              note="18 expenses"
            />
            <Metric
              label="Maintenance"
              value={formatPkr(78600)}
              note="42% of total"
            />
            <Metric label="Receipts" value="16 / 18" note="2 missing" />
            <Metric
              label="Pending review"
              value={formatPkr(12400)}
              note="1 expense"
            />
          </>
        ) : (
          <>
            <Metric label="Active owners" value="4" note="7 managed vehicles" />
            <Metric
              label="Revenue share"
              value={formatPkr(612000)}
              note="September"
            />
            <Metric
              label="Payable"
              value={formatPkr(315900)}
              note="Across 3 owners"
            />
            <Metric label="Due this week" value="2" note="Payout statements" />
          </>
        )}
      </section>
      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder={`Search ${module}…`}
        hasFilters={Boolean(search || filter !== "All")}
        onClear={() => {
          setSearch("");
          setFilter("All");
        }}
      >
        <FilterSelect
          label={module === "expenses" ? "Category" : "Status"}
          value={filter}
          onChange={setFilter}
          options={filterOptions}
        />
      </FilterBar>
      {rows.length ? (
        <div className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white">
          <div className="divide-y divide-[#EAECF0]">
            {rows.map((row) => (
              <RecordRow
                key={row.id}
                module={module}
                row={row as never}
                onOpen={() => setNotice(`${row.id} opened in prototype mode.`)}
              />
            ))}
          </div>
          <div className="border-t border-[#EAECF0] bg-[#F8FAFC] px-4 py-3 text-xs text-[#667085]">
            Showing {rows.length} records
          </div>
        </div>
      ) : (
        <EmptyState filtered />
      )}
    </div>
  );
}

function RecordRow({
  module,
  row,
  onOpen,
}: {
  module: Exclude<ModuleName, "reports">;
  row: Record<string, string | number | boolean>;
  onOpen: () => void;
}) {
  const primary =
    module === "bookings"
      ? `${row.id} · ${row.customer}`
      : module === "customers"
        ? String(row.name)
        : module === "expenses"
          ? String(row.description)
          : String(row.name);
  const secondary =
    module === "bookings"
      ? `${row.vehicle} · ${row.dates}`
      : module === "customers"
        ? `${row.phone} · ${row.cnic}`
        : module === "expenses"
          ? `${row.date} · ${row.vehicle}`
          : `${row.phone} · ${row.vehicles} vehicle${row.vehicles === 1 ? "" : "s"}`;
  const amount =
    module === "bookings" || module === "expenses"
      ? Number(row.amount)
      : module === "owners"
        ? Number(row.payable)
        : undefined;
  const badge =
    module === "expenses" ? String(row.category) : String(row.status);
  return (
    <article className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]">
        {module === "expenses" ? (
          <FileText size={18} />
        ) : (
          <IconFor module={module} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-[#344054]">{primary}</h2>
        <p className="mt-1 text-xs text-[#667085]">{secondary}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {amount !== undefined && (
          <strong className="text-sm tabular-nums">{formatPkr(amount)}</strong>
        )}
        <StatusBadge status={badge} />
        <Button size="sm" variant="ghost" onClick={onOpen}>
          View
        </Button>
      </div>
    </article>
  );
}
function IconFor({ module }: { module: string }) {
  return module === "bookings" ? (
    <CalendarDays size={18} />
  ) : (
    <UsersRound size={18} />
  );
}

function Reports({
  notice,
  setNotice,
}: {
  notice: string;
  setNotice: (value: string) => void;
}) {
  const [period, setPeriod] = useState("September 2026");
  return (
    <div className="space-y-6">
      <Toast message={notice} onDismiss={() => setNotice("")} />
      <PageHeader
        eyebrow="Performance"
        title="Reports"
        description="Understand fleet profitability, utilization, and collections."
        actions={
          <Button
            onClick={() => setNotice("CSV export prepared in prototype mode.")}
          >
            <FileText size={17} />
            Export CSV
          </Button>
        }
      />
      <div className="rounded-xl border border-[#E4E7EC] bg-white p-3">
        <label className="text-sm font-semibold text-[#344054]">
          Reporting period{" "}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="ml-3 h-10 rounded-[9px] border border-[#D0D5DD] bg-white px-3"
          >
            <option>September 2026</option>
            <option>August 2026</option>
            <option>Q3 2026</option>
          </select>
        </label>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Revenue"
          value={formatPkr(1842500)}
          note="+12.4% vs August"
        />
        <Metric
          label="Expenses"
          value={formatPkr(486300)}
          note="26.4% of revenue"
        />
        <Metric
          label="Net contribution"
          value={formatPkr(1356200)}
          note="73.6% margin"
        />
        <Metric label="Utilization" value="76%" note="+4 points" />
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-xl border border-[#E4E7EC] bg-white p-5">
          <h2 className="font-bold">Revenue vs expenses</h2>
          <div
            className="mt-6 flex h-52 items-end gap-4"
            aria-label="Monthly revenue chart"
          >
            {[
              ["Apr", 62, 23],
              ["May", 72, 28],
              ["Jun", 67, 25],
              ["Jul", 82, 31],
              ["Aug", 78, 29],
              ["Sep", 92, 27],
            ].map(([label, revenue, cost]) => (
              <div
                key={label}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-40 items-end gap-1">
                  <span
                    className="w-3 rounded-t bg-[#006FE6]"
                    style={{ height: `${revenue}%` }}
                  />
                  <span
                    className="w-3 rounded-t bg-[#FDB022]"
                    style={{ height: `${cost}%` }}
                  />
                </div>
                <span className="text-xs text-[#667085]">{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-[#E4E7EC] bg-white p-5">
          <h2 className="font-bold">Top vehicles</h2>
          <div className="mt-4 space-y-4">
            {[
              ["KIA Sportage · LHR-529", 286000, "82%"],
              ["Toyota Fortuner · AER-315", 258000, "74%"],
              ["Toyota Corolla · ICT-704", 224500, "84%"],
            ].map(([name, value, use]) => (
              <div key={name as string}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{name}</span>
                  <strong>{formatPkr(value as number)}</strong>
                </div>
                <p className="mt-1 text-xs text-[#667085]">{use} utilization</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
