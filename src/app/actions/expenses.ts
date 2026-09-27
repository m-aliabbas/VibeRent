"use server";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createExpense, transitionExpense } from "@/server/services/expense-service";
import type { CreateExpenseInput, ExpenseStatus } from "@/server/validation/expense";

function failure(error:unknown){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
export async function createExpenseAction(input:CreateExpenseInput){try{return {ok:true as const,data:createExpense(await getWebRequestContext(),input)};}catch(error){return failure(error)}}
export async function transitionExpenseAction(id:string,status:ExpenseStatus){try{return {ok:true as const,data:transitionExpense(await getWebRequestContext(),id,status)};}catch(error){return failure(error)}}
