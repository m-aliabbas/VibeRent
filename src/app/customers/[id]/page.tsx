import { notFound } from "next/navigation";
import { customers } from "@/lib/operations-data";
import { CustomerProfile } from "@/components/customers/customer-profile";
export function generateStaticParams() {
  return customers.map(({ id }) => ({ id }));
}
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = customers.find((item) => item.id === id);
  if (!customer) notFound();
  return <CustomerProfile customer={customer} />;
}
