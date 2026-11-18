import { notFound } from "next/navigation";
import { GuarantorProfile } from "@/components/guarantors/guarantor-profile";
import { getWebRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { getGuarantorDetail } from "@/server/services/guarantor-service";

export default async function GuarantorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let guarantor;
  try {
    guarantor = await getGuarantorDetail(await getWebRequestContext(), id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <GuarantorProfile guarantor={guarantor} />;
}
