"use server";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveExternalVehicle, listExternalVehicles, saveExternalVehicle, type ExternalVehicleDto } from "@/server/services/external-vehicle-service";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function listExternalVehiclesAction(){try{return {ok:true as const,data:await listExternalVehicles(await getWebRequestContext())}}catch(error){return failure(error)}}
export async function saveExternalVehicleAction(input:Partial<ExternalVehicleDto>){try{return {ok:true as const,data:await saveExternalVehicle(await getWebRequestContext(),input)}}catch(error){return failure(error)}}
export async function archiveExternalVehicleAction(id:string){try{return {ok:true as const,data:await archiveExternalVehicle(await getWebRequestContext(),id)}}catch(error){return failure(error)}}
