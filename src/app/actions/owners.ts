"use server";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createAgreement, recordOwnerPayout, saveOwner } from "@/server/services/owner-service";
import { deliverOwnerPayoutInvoice } from "@/server/services/notification-delivery-service";
function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function saveOwnerAction(input:Parameters<typeof saveOwner>[1]){try{return {ok:true as const,data:saveOwner(await getWebRequestContext(),input)}}catch(error){return failure(error)}}
export async function createAgreementAction(ownerId:string,input:Parameters<typeof createAgreement>[2]){try{return {ok:true as const,data:createAgreement(await getWebRequestContext(),ownerId,input)}}catch(error){return failure(error)}}
export async function recordOwnerPayoutAction(ownerId:string,input:Parameters<typeof recordOwnerPayout>[2]){try{const context=await getWebRequestContext();const data=recordOwnerPayout(context,ownerId,input);const notificationDelivery=await deliverOwnerPayoutInvoice(context,ownerId,input);return {ok:true as const,data:{...data,notificationDelivery}}}catch(error){return failure(error)}}
