import { notFound } from "next/navigation";
import { OperationsModule } from "@/components/modules/operations-module";
import { PageHeader } from "@/components/shared/page-header";

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
  if (
    ["bookings", "customers", "expenses", "reports", "owners"].includes(section)
  )
    return (
      <OperationsModule
        module={
          section as
            | "bookings"
            | "customers"
            | "expenses"
            | "reports"
            | "owners"
        }
      />
    );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title={data.title}
        description={data.description}
      />
      <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-[#C8D0DC] bg-white p-8 text-center">
        <p className="text-sm text-[#667085]">
          Settings will be implemented in the next product module batch.
        </p>
      </div>
    </div>
  );
}
