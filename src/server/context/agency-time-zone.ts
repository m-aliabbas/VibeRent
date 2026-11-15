import "server-only";
import { queryOne } from "@/db/query";
import { DEFAULT_TIME_ZONE, isNaiveDateTime, isValidTimeZone, zonedWallTimeToIso } from "@/lib/timezone";

const cache = new Map<string, { value: string; expires: number }>();

/** The agency's configured time zone (defaults to Pakistan, GMT+5). Cached briefly per process. */
export async function getAgencyTimeZone(agencyId: string): Promise<string> {
  const hit = cache.get(agencyId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const row = await queryOne<{ timezone: string | null }>("SELECT timezone FROM agencies WHERE id=?", [agencyId]);
  const value = isValidTimeZone(row?.timezone) ? row!.timezone! : DEFAULT_TIME_ZONE;
  cache.set(agencyId, { value, expires: Date.now() + 60_000 });
  return value;
}

export function forgetAgencyTimeZone(agencyId: string) {
  cache.delete(agencyId);
}

/** Normalizes a client-supplied date/time to a UTC ISO instant, reading zone-less values in the agency zone. */
export async function agencyInstant(agencyId: string, value: string | null | undefined) {
  return zonedWallTimeToIso(value, await getAgencyTimeZone(agencyId));
}

/**
 * Returns a shallow copy of a raw payload whose zone-less date/time fields
 * ("2026-11-15T17:00") are rewritten as UTC instants in the agency zone. Fields that
 * already carry an offset, are missing, or are not strings are left untouched so the
 * normal validators still report them.
 */
export async function withAgencyInstants<T>(agencyId: string, raw: T, fields: string[]): Promise<T> {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (!fields.some(field => typeof record[field] === "string" && isNaiveDateTime(record[field] as string))) return raw;
  const timeZone = await getAgencyTimeZone(agencyId);
  const copy: Record<string, unknown> = { ...record };
  for (const field of fields) {
    const value = copy[field];
    if (typeof value === "string" && isNaiveDateTime(value)) copy[field] = zonedWallTimeToIso(value, timeZone) || value;
  }
  return copy as T;
}
