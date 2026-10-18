import { notFound } from "next/navigation";
import { CustomersModule } from "@/components/customers/customers-module";
import { BookingsWorkspace } from "@/components/bookings/bookings-workspace";
import { OwnersWorkspace } from "@/components/owners/owners-workspace";
import { ExpensesWorkspace } from "@/components/expenses/expenses-workspace";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { DriversWorkspace } from "@/components/drivers/drivers-workspace";
import { GuarantorsWorkspace } from "@/components/guarantors/guarantors-workspace";
import { ArchiveWorkspace } from "@/components/archive/archive-workspace";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getWebRequestContext } from "@/server/auth/session";
import { getExpenseWorkspace } from "@/server/services/expense-service";
import { listOwners } from "@/server/services/owner-service";
import { getReports } from "@/server/services/report-service";
import { listDrivers } from "@/server/services/driver-service";
import { listGuarantors } from "@/server/services/guarantor-service";
import { listArchive } from "@/server/services/archive-service";
import { getOrganizationSettings } from "@/server/services/organization-settings-service";

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
  guarantors: { title:"Guarantors",description:"Guarantors for rental bookings." },
  archive: { title:"Archive",description:"Deleted and archived records." },
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
  if (section === "drivers") return <DriversWorkspace initial={listDrivers(await getWebRequestContext())} />;
  if (section === "guarantors") return <GuarantorsWorkspace initial={listGuarantors(await getWebRequestContext())} />;
  if (section === "archive") {const context=await getWebRequestContext();return <ArchiveWorkspace initial={listArchive(context)} canRestore={context.roles.some(role=>["agency_owner","fleet_manager"].includes(role))} canPurge={context.roles.includes("agency_owner")}/>;}
  if (section === "settings") return <SettingsWorkspace initial={getOrganizationSettings(await getWebRequestContext())} />;
  notFound();
}
