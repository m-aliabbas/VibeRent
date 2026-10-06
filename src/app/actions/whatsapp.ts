"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { connectWhatsApp, disconnectWhatsApp, resetWhatsApp, saveWhatsAppSettings } from "@/server/services/whatsapp-settings-service";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function saveWhatsAppSettingsAction(input:{ownerNumber:string;listeningEnabled:boolean}){try{return {ok:true as const,data:saveWhatsAppSettings(await getWebRequestContext(),input)}}catch(error){return failure(error)}}
export async function connectWhatsAppAction(){try{return {ok:true as const,data:await connectWhatsApp(await getWebRequestContext())}}catch(error){return failure(error)}}
export async function disconnectWhatsAppAction(){try{return {ok:true as const,data:await disconnectWhatsApp(await getWebRequestContext())}}catch(error){return failure(error)}}
export async function resetWhatsAppAction(){try{return {ok:true as const,data:await resetWhatsApp(await getWebRequestContext())}}catch(error){return failure(error)}}
