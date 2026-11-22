"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveGuarantor, defaultGuarantorForCustomer, guarantorFromCustomer, linkCustomerGuarantor, listGuarantors, saveGuarantor, unlinkCustomerGuarantor, type GuarantorSaveInput } from "@/server/services/guarantor-service";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function listGuarantorsAction(){try{return {ok:true as const,data:await listGuarantors(await getWebRequestContext())};}catch(error){return failure(error)}}
export async function saveGuarantorAction(input:GuarantorSaveInput){try{const data=await saveGuarantor(await getWebRequestContext(),input);revalidatePath("/guarantors");if(input.id)revalidatePath(`/guarantors/${input.id}`);return {ok:true as const,data};}catch(error){return failure(error)}}
export async function archiveGuarantorAction(id:string){try{const data=await archiveGuarantor(await getWebRequestContext(),id);revalidatePath("/guarantors");return {ok:true as const,data};}catch(error){return failure(error)}}

/** Links a saved guarantor to a customer (one guarantor can back many customers). */
export async function linkCustomerGuarantorAction(customerId:string,guarantorId:string){try{const data=await linkCustomerGuarantor(await getWebRequestContext(),customerId,guarantorId);revalidatePath(`/customers/${customerId}`);revalidatePath(`/guarantors/${guarantorId}`);revalidatePath("/guarantors");return {ok:true as const,data};}catch(error){return failure(error)}}
export async function unlinkCustomerGuarantorAction(customerId:string,guarantorId:string){try{const data=await unlinkCustomerGuarantor(await getWebRequestContext(),customerId,guarantorId);revalidatePath(`/customers/${customerId}`);revalidatePath(`/guarantors/${guarantorId}`);revalidatePath("/guarantors");return {ok:true as const,data};}catch(error){return failure(error)}}
/** Uses an existing customer as a guarantor: reuses the guarantor with the same CNIC or creates one from the customer's details. */
export async function guarantorFromCustomerAction(customerId:string){try{const data=await guarantorFromCustomer(await getWebRequestContext(),customerId);revalidatePath("/guarantors");return {ok:true as const,data};}catch(error){return failure(error)}}
/** Guarantor to pre-select for a customer in the booking wizard (latest booking's, else latest linked). */
export async function defaultGuarantorForCustomerAction(customerId:string){try{return {ok:true as const,data:await defaultGuarantorForCustomer(await getWebRequestContext(),customerId)};}catch(error){return failure(error)}}
