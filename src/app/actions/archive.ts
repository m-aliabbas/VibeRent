"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { listArchive, permanentlyDeleteArchived, restoreArchived, type ArchiveKind } from "@/server/services/archive-service";
function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{message:issue.message}};}
export async function listArchiveAction(){try{return {ok:true as const,data:await listArchive(await getWebRequestContext())}}catch(error){return failure(error)}}
export async function restoreArchivedAction(kind:ArchiveKind,id:string){try{const data=await restoreArchived(await getWebRequestContext(),kind,id);revalidatePath("/archive");revalidatePath(`/${kind}s`);return {ok:true as const,data}}catch(error){return failure(error)}}
export async function permanentlyDeleteArchivedAction(kind:ArchiveKind,id:string,options:{deleteHistory?:boolean}={}){try{const data=await permanentlyDeleteArchived(await getWebRequestContext(),kind,id,options);for(const route of ["/archive","/vehicles","/bookings","/expenses","/reports","/owners","/customers"])revalidatePath(route);return {ok:true as const,data}}catch(error){return failure(error)}}
