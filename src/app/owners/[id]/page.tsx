import { notFound } from "next/navigation";
import { OwnerProfile } from "@/components/owners/owner-profile";
import { getWebRequestContext } from "@/server/auth/session";
import { DomainError } from "@/server/domain/errors";
import { getOwner } from "@/server/services/owner-service";
export default async function OwnerPage({params}:{params:Promise<{id:string}>}){const {id}=await params;let owner;try{owner=await getOwner(await getWebRequestContext(),id)}catch(error){if(error instanceof DomainError&&error.code==="NOT_FOUND")notFound();throw error}return <OwnerProfile owner={owner}/>}
