"use server";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createExpense, getExpenseWorkspace, transitionExpense, updateExpense } from "@/server/services/expense-service";
import { deliverOwnerExpenseNotice } from "@/server/services/notification-delivery-service";
import type { CreateExpenseInput, ExpenseStatus } from "@/server/validation/expense";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function createExpenseAction(input:CreateExpenseInput){try{const context=await getWebRequestContext();const data=createExpense(context,input);const notificationDelivery=await deliverOwnerExpenseNotice(context,data.id);return {ok:true as const,data:{...data,notificationDelivery}};}catch(error){return failure(error)}}
export async function updateExpenseAction(id:string,input:CreateExpenseInput){try{return {ok:true as const,data:updateExpense(await getWebRequestContext(),id,input)};}catch(error){return failure(error)}}
export async function transitionExpenseAction(id:string,status:ExpenseStatus){try{return {ok:true as const,data:transitionExpense(await getWebRequestContext(),id,status)};}catch(error){return failure(error)}}
export async function getExpenseWorkspaceAction(){try{return {ok:true as const,data:getExpenseWorkspace(await getWebRequestContext())};}catch(error){return failure(error)}}
