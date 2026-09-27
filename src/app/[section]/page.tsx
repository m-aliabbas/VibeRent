import { notFound } from "next/navigation";
import { CustomersModule } from "@/components/customers/customers-module";
import { BookingsWorkspace } from "@/components/bookings/bookings-workspace";
import { OwnersWorkspace } from "@/components/owners/owners-workspace";
import { ExpensesWorkspace } from "@/components/expenses/expenses-workspace";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getWebRequestContext } from "@/server/auth/session";
import { getExpenseWorkspace } from "@/server/services/expense-service";
import { listOwners } from "@/server/services/owner-service";
import { getReports } from "@/server/services/report-service";

const sections: Record<string, { title: string; description: string }> = {
  bookings: {
    title: "Bookings",
    description:
      "Availability, reservations, check-outs, and returns will live here.",
  },
  customers: {
    title: "Customers",
    description:
      "Customer profiles and rental history are next in the rollout.",
  },
  expenses: {
    title: "Expenses",
    description: "Vehicle costs, receipts, and categorization are coming next.",
  },
  reports: {
    title: "Reports",
    description:
      "Fleet profitability and utilization reporting is planned for the next milestone.",
  },
  owners: {
    title: "Owners",
    description: "Managed vehicles, statements, and payouts will live here.",
  },
  settings: {
    title: "Settings",
    description:
      "Agency profile, cities, rates, and team preferences will live here.",
  },
};

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const data = sections[section];
  if (!data) notFound();
  if (section === "customers") return <CustomersModule />;
  if (section === "bookings") return <BookingsWorkspace />;
  if (section === "owners") return <OwnersWorkspace data={listOwners(await getWebRequestContext())} />;
  if (section === "expenses") return <ExpensesWorkspace data={getExpenseWorkspace(await getWebRequestContext())} />;
  if (section === "reports") return <ReportsWorkspace data={getReports(await getWebRequestContext())} />;
  return <SettingsWorkspace />;
}
