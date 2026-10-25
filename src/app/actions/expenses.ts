"use server";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createExpense, getExpenseWorkspace, transitionExpense, updateExpense } from "@/server/services/expense-service";
import { deliverOwnerExpenseNotice } from "@/server/services/notification-delivery-service";
import { deliverInBackground } from "@/server/api/delivery";
import type { CreateExpenseInput, ExpenseStatus } from "@/server/validation/expense";
import { createRecurringExpense, setRecurringExpenseStatus, updateRecurringExpense, type CreateRecurringExpenseInput, type RecurringExpenseStatus, type UpdateRecurringExpenseInput } from "@/server/services/recurring-expense-service";
import { revalidatePath } from "next/cache";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function createExpenseAction(input:CreateExpenseInput){try{const context=await getWebRequestContext();const data=await createExpense(context,input);const notificationDelivery=deliverInBackground("server","Owner expense notice",()=>deliverOwnerExpenseNotice(context,data.id));return {ok:true as const,data:{...data,notificationDelivery}};}catch(error){return failure(error)}}
export async function updateExpenseAction(id:string,input:CreateExpenseInput){try{return {ok:true as const,data:await updateExpense(await getWebRequestContext(),id,input)};}catch(error){return failure(error)}}
export async function transitionExpenseAction(id:string,status:ExpenseStatus){try{return {ok:true as const,data:await transitionExpense(await getWebRequestContext(),id,status)};}catch(error){return failure(error)}}
export async function getExpenseWorkspaceAction(){try{return {ok:true as const,data:await getExpenseWorkspace(await getWebRequestContext())};}catch(error){return failure(error)}}

function revalidateRecurring(vehicleId?:string|null){revalidatePath("/expenses");revalidatePath("/");revalidatePath("/reports");if(vehicleId)revalidatePath(`/vehicles/${vehicleId}`);}
export async function createRecurringExpenseAction(input:CreateRecurringExpenseInput){try{const data=await createRecurringExpense(await getWebRequestContext(),input);revalidateRecurring(data.recurring.vehicleId);return {ok:true as const,data};}catch(error){return failure(error)}}
export async function updateRecurringExpenseAction(id:string,input:UpdateRecurringExpenseInput){try{const data=await updateRecurringExpense(await getWebRequestContext(),id,input);revalidateRecurring(data.vehicleId);return {ok:true as const,data};}catch(error){return failure(error)}}
export async function setRecurringExpenseStatusAction(id:string,status:RecurringExpenseStatus){try{const data=await setRecurringExpenseStatus(await getWebRequestContext(),id,status);revalidateRecurring(data.recurring.vehicleId);return {ok:true as const,data};}catch(error){return failure(error)}}
