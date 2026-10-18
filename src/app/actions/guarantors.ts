"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveGuarantor, listGuarantors, saveGuarantor, type GuarantorDto } from "@/server/services/guarantor-service";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function listGuarantorsAction(){try{return {ok:true as const,data:await listGuarantors(await getWebRequestContext())};}catch(error){return failure(error)}}
export async function saveGuarantorAction(input:GuarantorDto){try{const data=await saveGuarantor(await getWebRequestContext(),input);revalidatePath("/guarantors");return {ok:true as const,data};}catch(error){return failure(error)}}
export async function archiveGuarantorAction(id:string){try{const data=await archiveGuarantor(await getWebRequestContext(),id);revalidatePath("/guarantors");return {ok:true as const,data};}catch(error){return failure(error)}}
