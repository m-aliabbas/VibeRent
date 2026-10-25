"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveOwner, createAgreement, recordOwnerPayout, saveOwner } from "@/server/services/owner-service";
import { deliverOwnerPayoutInvoice } from "@/server/services/notification-delivery-service";
import { deliverInBackground } from "@/server/api/delivery";
function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function saveOwnerAction(input:Parameters<typeof saveOwner>[1]){try{return {ok:true as const,data:await saveOwner(await getWebRequestContext(),input)}}catch(error){return failure(error)}}
export async function createAgreementAction(ownerId:string,input:Parameters<typeof createAgreement>[2]){try{return {ok:true as const,data:await createAgreement(await getWebRequestContext(),ownerId,input)}}catch(error){return failure(error)}}
export async function archiveOwnerAction(ownerId:string){try{const data=await archiveOwner(await getWebRequestContext(),ownerId);revalidatePath("/owners");revalidatePath(`/owners/${ownerId}`);return {ok:true as const,data}}catch(error){return failure(error)}}
export async function recordOwnerPayoutAction(ownerId:string,input:Parameters<typeof recordOwnerPayout>[2]){try{const context=await getWebRequestContext();const data=await recordOwnerPayout(context,ownerId,input);revalidatePath("/owners");revalidatePath(`/owners/${ownerId}`);revalidatePath("/");revalidatePath("/reports");const notificationDelivery=deliverInBackground("server","Owner payout receipt",()=>deliverOwnerPayoutInvoice(context,ownerId,input));return {ok:true as const,data:{...data,notificationDelivery}}}catch(error){return failure(error)}}
