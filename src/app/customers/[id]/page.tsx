import { notFound } from "next/navigation";
import { CustomerProfile } from "@/components/customers/customer-profile";
import { getWebRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { getCustomerDetail } from "@/server/services/customer-service";
import { getCustomerAsGuarantor, listCustomerGuarantors } from "@/server/services/guarantor-service";
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getWebRequestContext();
  let customer, guarantors, asGuarantor;
  try {
    [customer, guarantors, asGuarantor] = await Promise.all([
      getCustomerDetail(context, id),
      listCustomerGuarantors(context, id),
      getCustomerAsGuarantor(context, id),
    ]);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <CustomerProfile customer={customer} guarantors={guarantors} asGuarantor={asGuarantor} />;
}
