import { notFound } from "next/navigation";
import { CustomersModule } from "@/components/customers/customers-module";
import { BookingsWorkspace } from "@/components/bookings/bookings-workspace";
import { OwnersWorkspace } from "@/components/owners/owners-workspace";
import { ExpensesWorkspace } from "@/components/expenses/expenses-workspace";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { DriversWorkspace } from "@/components/drivers/drivers-workspace";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getWebRequestContext } from "@/server/auth/session";
import { getExpenseWorkspace } from "@/server/services/expense-service";
import { listOwners } from "@/server/services/owner-service";
import { getReports } from "@/server/services/report-service";
import { listDrivers } from "@/server/services/driver-service";
import { getOrganizationSettings } from "@/server/services/organization-settings-service";
import { isDesktopRuntime } from "@/server/desktop/runtime-paths";

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
  drivers: { title:"Drivers",description:"Drivers for with-driver rentals." },
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
  if (section === "owners") return <OwnersWorkspace data={await listOwners(await getWebRequestContext())} />;
  if (section === "expenses") return <ExpensesWorkspace data={await getExpenseWorkspace(await getWebRequestContext())} />;
  if (section === "reports") return <ReportsWorkspace data={await getReports(await getWebRequestContext())} />;
  if (section === "drivers") return <DriversWorkspace initial={await listDrivers(await getWebRequestContext())} />;
  if (section === "settings") {
    const context = await getWebRequestContext();
    return <SettingsWorkspace initial={await getOrganizationSettings(context)} desktop={isDesktopRuntime()} canPreviewMigration={context.roles.includes("agency_owner")} />;
  }
  notFound();
}
