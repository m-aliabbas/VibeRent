"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createAgencyCity, createExpenseCategory, listAgencyCities, listExpenseCategories } from "@/server/services/catalog-service";

function failure(error: unknown) {
  const issue = asDomainError(error);
  return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } };
}

export async function listExpenseCategoriesAction() {
  try { return { ok: true as const, data: listExpenseCategories(await getWebRequestContext()) }; }
  catch (error) { return failure(error); }
}

export async function createExpenseCategoryAction(name: string) {
  try { return { ok: true as const, data: createExpenseCategory(await getWebRequestContext(), name) }; }
  catch (error) { return failure(error); }
}

export async function listAgencyCitiesAction() {
  try { return { ok: true as const, data: listAgencyCities(await getWebRequestContext()) }; }
  catch (error) { return failure(error); }
}

export async function createAgencyCityAction(name: string) {
  try { return { ok: true as const, data: createAgencyCity(await getWebRequestContext(), name) }; }
  catch (error) { return failure(error); }
}
