"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { searchAgencyRecords, type GlobalSearchScope } from "@/server/services/search-service";

export async function searchAgencyRecordsAction(query: string, scope: GlobalSearchScope = "all") {
  try {
    return { ok: true as const, data: await searchAgencyRecords(await getWebRequestContext(), query, scope) };
  } catch (error) {
    return { ok: false as const, error: { message: asDomainError(error).message } };
  }
}
