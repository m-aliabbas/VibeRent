"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveOwner, createAgreement, recordOwnerPayout, saveOwner } from "@/server/services/owner-service";
import { notices, withNotices } from "@/server/notifications/notices";
function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function saveOwnerAction(input:Parameters<typeof saveOwner>[1]){try{return {ok:true as const,data:await saveOwner(await getWebRequestContext(),input)}}catch(error){return failure(error)}}
export async function createAgreementAction(ownerId:string,input:Parameters<typeof createAgreement>[2]){try{return {ok:true as const,data:await createAgreement(await getWebRequestContext(),ownerId,input)}}catch(error){return failure(error)}}
export async function archiveOwnerAction(ownerId:string){try{const data=await archiveOwner(await getWebRequestContext(),ownerId);revalidatePath("/owners");revalidatePath(`/owners/${ownerId}`);return {ok:true as const,data}}catch(error){return failure(error)}}
export async function recordOwnerPayoutAction(ownerId:string,input:Parameters<typeof recordOwnerPayout>[2]){try{const context=await getWebRequestContext();const data=await withNotices(()=>recordOwnerPayout(context,ownerId,input),async()=>({notificationDelivery:await notices.payout(context,"server",ownerId,input)}));revalidatePath("/owners");revalidatePath(`/owners/${ownerId}`);revalidatePath("/");revalidatePath("/reports");return {ok:true as const,data}}catch(error){return failure(error)}}
