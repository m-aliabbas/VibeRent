"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveOwner, createAgreement, recordOwnerPayout, saveOwner } from "@/server/services/owner-service";
import { notices, withNotices } from "@/server/notifications/notices";
import { requireRole } from "@/server/auth/authorize";
import { queryOne } from "@/db/query";
import { saveOwnerFixedChargeSettings } from "@/server/services/owner-fixed-charge-service";
function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function saveOwnerAction(input:Parameters<typeof saveOwner>[1]){try{return {ok:true as const,data:await saveOwner(await getWebRequestContext(),input)}}catch(error){return failure(error)}}
export async function createAgreementAction(ownerId:string,input:Parameters<typeof createAgreement>[2]){try{return {ok:true as const,data:await createAgreement(await getWebRequestContext(),ownerId,input)}}catch(error){return failure(error)}}
export async function archiveOwnerAction(ownerId:string){try{const data=await archiveOwner(await getWebRequestContext(),ownerId);revalidatePath("/owners");revalidatePath(`/owners/${ownerId}`);return {ok:true as const,data}}catch(error){return failure(error)}}
export async function recordOwnerPayoutAction(ownerId:string,input:Parameters<typeof recordOwnerPayout>[2]){try{const context=await getWebRequestContext();const data=await withNotices(()=>recordOwnerPayout(context,ownerId,input),async()=>({notificationDelivery:await notices.payout(context,"server",ownerId,input)}));revalidatePath("/owners");revalidatePath(`/owners/${ownerId}`);revalidatePath("/");revalidatePath("/reports");return {ok:true as const,data}}catch(error){return failure(error)}}

export async function saveOwnerFixedChargeAction(input:{amount:number;label:string;fromMonth:string}){try{const data=await saveOwnerFixedChargeSettings(await getWebRequestContext(),input);revalidatePath("/owners");revalidatePath("/expenses");revalidatePath("/reports");return {ok:true as const,data}}catch(error){return failure(error)}}

/** One click: queue the owner's statement PDF for a period to their WhatsApp. */
export async function sendOwnerStatementAction(ownerId:string,period:{from:string;to:string}){
  try{
    const context=await getWebRequestContext();
    requireRole(context,["agency_owner","fleet_manager","accountant"]);
    const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);
    if(!valid(period.from)||!valid(period.to)||period.from>period.to)return {ok:false as const,error:{code:"VALIDATION_FAILED",message:"Choose a valid statement period.",fieldErrors:{}}};
    const owner=await queryOne<{id:string}>("SELECT id FROM owners WHERE agency_id=? AND id=? LIMIT 1",[context.agencyId,ownerId]);
    if(!owner)return {ok:false as const,error:{code:"NOT_FOUND",message:"Owner not found.",fieldErrors:{}}};
    const data=await notices.ownerStatement(context,"server",ownerId,{from:period.from,to:period.to,reason:"manual"});
    return {ok:true as const,data};
  }catch(error){return failure(error)}
}
