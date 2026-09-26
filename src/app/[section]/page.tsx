import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

const sections: Record<string, { title: string; description: string }> = {
  bookings: { title: "Bookings", description: "Availability, reservations, check-outs, and returns will live here." },
  customers: { title: "Customers", description: "Customer profiles and rental history are next in the rollout." },
  expenses: { title: "Expenses", description: "Vehicle costs, receipts, and categorization are coming next." },
  reports: { title: "Reports", description: "Fleet profitability and utilization reporting is planned for the next milestone." },
  owners: { title: "Owners", description: "Managed vehicles, statements, and payouts will live here." },
  settings: { title: "Settings", description: "Agency profile, cities, rates, and team preferences will live here." },
};

export function generateStaticParams() { return Object.keys(sections).map((section) => ({ section })); }
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; const data = sections[section]; if (!data) notFound(); return <div className="space-y-8"><PageHeader eyebrow="Workspace" title={data.title} description={data.description}/><div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-[#C8D0DC] bg-white p-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#EFF8FF] text-[#006FE6]"><Construction size={25}/></span><h2 className="mt-5 text-xl font-bold">This workspace is being prepared</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">The shared foundation and Vehicles workflow are ready. This module will reuse those patterns in the next build stage.</p><Button asChild variant="secondary" className="mt-6"><Link href="/"><ArrowLeft size={17}/>Back to dashboard</Link></Button></div></div></div>; }
