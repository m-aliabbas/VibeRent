"use server";

import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { archiveCustomer, createCustomer, getCustomer, listCustomers, updateCustomer, payCustomerBalance } from "@/server/services/customer-service";
import { notices, withNotices } from "@/server/notifications/notices";
import { requireRole } from "@/server/auth/authorize";

/** One click: queue the customer's ledger PDF to their WhatsApp. */
export async function sendCustomerStatementAction(id:string,filters:{from?:string;to?:string;plate?:string}={}) {
  try {
    const context=await getWebRequestContext();
    requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
    await getCustomer(context,id);
    const valid=(value?:string)=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value);
    if(!valid(filters.from)||!valid(filters.to))return {ok:false as const,error:{code:"VALIDATION_FAILED",message:"Choose a valid date range.",fieldErrors:{}}};
    const data=await notices.customerStatement(context,"server",id,{from:filters.from||undefined,to:filters.to||undefined,plate:filters.plate||undefined,reason:"manual"});
    return {ok:true as const,data};
  } catch(error) { return failure(error); }
}

export async function payCustomerBalanceAction(id:string,input:{amount:number;method:string;reference?:string;idempotencyKey:string;discount?:number;paidOn?:string}) {
  try {
    const context=await getWebRequestContext();
    const data=await withNotices(()=>payCustomerBalance(context,id,input),async result=>({
      notificationDelivery:input.amount>0
        ?await notices.customerPayment(context,"server",id,{amount:input.amount,discount:input.discount??0,method:input.method,reference:input.reference,allocations:result.allocations,idempotencyKey:input.idempotencyKey,paidOn:input.paidOn})
        :{status:"skipped" as const,message:"Discount recorded. No payment receipt was needed."},
    }));
    revalidatePath(`/customers/${id}`);revalidatePath("/customers");revalidatePath("/bookings");revalidatePath("/reports");revalidatePath("/");
    return {ok:true as const,data};
  } catch(error) { return failure(error); }
}
import { createCustomerCnicDraft, getCustomerCnicIntake, uploadCustomerCnic, type CustomerCnicTarget } from "@/server/services/customer-cnic-service";
import type { CnicSide } from "@/server/services/booking-cnic-service";
import type { CreateCustomerInput } from "@/server/validation/customer";

type CustomerDto = {
  id: string;
  name: string;
  fatherName: string | null;
  phone: string;
  cnic: string;
  email: string | null;
  dateOfBirth: string | null;
  address: string | null;
  cnicExpiresAt: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  status: string;
  version: number;
  updatedAt: string;
  bookingCount: number;
  paidAmount: number;
  outstanding: number;
};

type ActionError = { code: string; message: string; fieldErrors: Record<string, string> };

function failure(error: unknown): { ok: false; error: ActionError } {
  const issue = asDomainError(error);
  return {
    ok: false,
    error: {
      code: issue.code,
      message: issue.message,
      fieldErrors: issue.fieldErrors ?? {},
    },
  };
}

export async function listCustomersAction(): Promise<
  { ok: true; data: CustomerDto[] } | { ok: false; error: ActionError }
> {
  try {
    return { ok: true, data: await listCustomers(await getWebRequestContext()) };
  } catch (error) {
    return failure(error);
  }
}

export async function createCustomerAction(
  input: CreateCustomerInput,
): Promise<{ ok: true; data: CustomerDto } | { ok: false; error: ActionError }> {
  try {
    return { ok: true, data: await createCustomer(await getWebRequestContext(), input) };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCustomerAction(
  id: string,
  input: CreateCustomerInput & { status?: string },
): Promise<{ ok: true; data: CustomerDto } | { ok: false; error: ActionError }> {
  try {
    return { ok: true, data: await updateCustomer(await getWebRequestContext(), id, input) };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveCustomerAction(id:string) {
  try {
    const data=await archiveCustomer(await getWebRequestContext(),id);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return {ok:true as const,data};
  } catch(error) { return failure(error); }
}

export async function startCustomerCnicDraftAction() {
  try { return { ok: true as const, data: createCustomerCnicDraft(await getWebRequestContext()) }; }
  catch (error) { return failure(error); }
}

export async function getCustomerCnicAction(target: CustomerCnicTarget) {
  try { return { ok: true as const, data: await getCustomerCnicIntake(await getWebRequestContext(), target) }; }
  catch (error) { return failure(error); }
}

export async function uploadCustomerCnicAction(formData: FormData) {
  try {
    const targetType = formData.get("targetType");
    const targetId = formData.get("targetId");
    const side = formData.get("side");
    const image = formData.get("image");
    if ((targetType !== "customer" && targetType !== "draft") || typeof targetId !== "string" || (side !== "front" && side !== "back") || !(image instanceof File)) throw new Error("Invalid CNIC upload payload.");
    return { ok: true as const, data: await uploadCustomerCnic(await getWebRequestContext(), { type: targetType, id: targetId }, side as CnicSide, image) };
  } catch (error) { return failure(error); }
}
