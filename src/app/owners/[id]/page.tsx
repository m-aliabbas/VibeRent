import { notFound } from "next/navigation";
import { OwnerProfile } from "@/components/owners/owner-profile";
import { getWebRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { getOwner } from "@/server/services/owner-service";
export default async function OwnerPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const context=await getWebRequestContext();let owner;try{owner=await getOwner(context,id)}catch(error){if(error instanceof DomainError&&error.code==="NOT_FOUND")notFound();throw error}return <OwnerProfile owner={owner} canEditAgreement={context.roles.some(role=>["agency_owner","fleet_manager"].includes(role))} canPay={context.roles.some(role=>["agency_owner","accountant"].includes(role))}/>}
