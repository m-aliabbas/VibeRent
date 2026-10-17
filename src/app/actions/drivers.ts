"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveDriver,listDrivers,saveDriver,type DriverDto } from "@/server/services/driver-service";
export async function listDriversAction(){try{return {ok:true as const,data:await listDrivers(await getWebRequestContext())}}catch(error){return {ok:false as const,error:{message:asDomainError(error).message}}}}
export async function saveDriverAction(input:DriverDto){try{return {ok:true as const,data:await saveDriver(await getWebRequestContext(),input)}}catch(error){const issue=asDomainError(error);return {ok:false as const,error:{message:issue.message,fieldErrors:issue.fieldErrors??{}}}}}
export async function archiveDriverAction(id:string){try{const data=await archiveDriver(await getWebRequestContext(),id);revalidatePath("/drivers");return {ok:true as const,data}}catch(error){const issue=asDomainError(error);return {ok:false as const,error:{message:issue.message,fieldErrors:issue.fieldErrors??{}}}}}
