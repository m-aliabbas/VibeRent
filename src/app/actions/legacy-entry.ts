"use server";

import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { recordLegacyBooking, type LegacyBookingInput } from "@/server/services/legacy-entry-service";

export async function recordLegacyBookingAction(input: LegacyBookingInput) {
  try {
    const data=await recordLegacyBooking(await getWebRequestContext(),input);
    for(const path of ["/","/bookings","/reports","/expenses","/customers","/vehicles"]) revalidatePath(path);
    return {ok:true as const,data};
  } catch(error) {
    const issue=asDomainError(error);
    return {ok:false as const,error:{message:issue.message,fieldErrors:issue.fieldErrors??{}}};
  }
}
