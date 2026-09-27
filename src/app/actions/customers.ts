"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { createCustomer, listCustomers } from "@/server/services/customer-service";
import type { CreateCustomerInput } from "@/server/validation/customer";

type CustomerDto = {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  email: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  status: string;
  version: number;
  updatedAt: string;
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
    return { ok: true, data: listCustomers(await getWebRequestContext()) };
  } catch (error) {
    return failure(error);
  }
}

export async function createCustomerAction(
  input: CreateCustomerInput,
): Promise<{ ok: true; data: CustomerDto } | { ok: false; error: ActionError }> {
  try {
    return { ok: true, data: createCustomer(await getWebRequestContext(), input) };
  } catch (error) {
    return failure(error);
  }
}
