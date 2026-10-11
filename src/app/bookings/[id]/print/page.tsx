import { notFound } from "next/navigation";
import { AgreementPrintDocument } from "@/components/bookings/agreement-print-document";
import { AgreementPrintTrigger } from "@/components/bookings/agreement-print-trigger";
import { getWebRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { getRentalAgreementPrintData } from "@/server/documents/rental-agreement";

export default async function AgreementPrintPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  let data;
  try{
    data=await getRentalAgreementPrintData(await getWebRequestContext(),id);
  }catch(error){
    if(error instanceof DomainError&&error.code==="NOT_FOUND")notFound();
    throw error;
  }
  return <div className="agreement-print-workspace"><AgreementPrintTrigger/><AgreementPrintDocument data={data}/></div>;
}
