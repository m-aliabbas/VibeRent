import { notFound } from "next/navigation";
import { CustomerProfile } from "@/components/customers/customer-profile";
import { getWebRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { getCustomerDetail } from "@/server/services/customer-service";
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let customer;
  try {
    customer = await getCustomerDetail(await getWebRequestContext(), id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <CustomerProfile customer={customer} />;
}
