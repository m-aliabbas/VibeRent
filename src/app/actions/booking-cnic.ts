"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { getBookingCnicIntake, uploadBookingCnic, type CnicSide } from "@/server/services/booking-cnic-service";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}

export async function getBookingCnicAction(bookingDraftId:string){
  try{return {ok:true as const,data:getBookingCnicIntake(await getWebRequestContext(),bookingDraftId)};}
  catch(error){return failure(error);}
}

export async function uploadBookingCnicAction(formData:FormData){
  try{
    const bookingDraftId=formData.get("bookingDraftId");
    const side=formData.get("side");
    const image=formData.get("image");
    if(typeof bookingDraftId!=="string"||(side!=="front"&&side!=="back")||!(image instanceof File)) throw new Error("Invalid CNIC upload payload.");
    return {ok:true as const,data:await uploadBookingCnic(await getWebRequestContext(),bookingDraftId,side as CnicSide,image)};
  }catch(error){return failure(error);}
}
