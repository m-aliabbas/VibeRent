/**
 * Agency time-zone helpers shared by the browser and the server.
 *
 * Rental times are stored as UTC ISO instants. Staff type wall-clock times
 * ("2026-11-15T17:00") in the agency's own zone, so every conversion between a
 * datetime-local value and an instant must go through the agency zone — never the
 * zone of the browser or of the server process (hosted servers run in UTC, which
 * is what shifted 5:00 pm bookings to 10:00 pm).
 */

export const DEFAULT_TIME_ZONE = "Asia/Karachi";

export const TIME_ZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Asia/Karachi", label: "Pakistan (GMT+5)" },
  { value: "Asia/Dubai", label: "UAE (GMT+4)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia (GMT+3)" },
  { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
  { value: "Asia/Dhaka", label: "Bangladesh (GMT+6)" },
  { value: "Europe/London", label: "United Kingdom (GMT+0/+1)" },
  { value: "UTC", label: "UTC (GMT+0)" },
];

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// The zone used by formatters that are not handed one explicitly. The browser sets it
// once from the signed-in agency (see TimeZoneSync); server code passes zones explicitly.
let activeTimeZone = DEFAULT_TIME_ZONE;
export function setActiveTimeZone(value: string | null | undefined) {
  activeTimeZone = isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}
export function getActiveTimeZone() {
  return activeTimeZone;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(instant: number, timeZone: string) {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second) };
}

/** Offset of the zone from UTC at the given instant, in minutes (Karachi → +300). */
export function zoneOffsetMinutes(instant: number, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** True when a date string carries no zone information (datetime-local or plain date). */
export function isNaiveDateTime(value: string) {
  return NAIVE.test(value.trim());
}

/**
 * Converts a wall-clock value typed in the agency zone into a UTC ISO instant.
 * Values that already carry "Z" or an offset are returned as their ISO instant.
 * Returns "" when the value cannot be parsed.
 */
export function zonedWallTimeToIso(value: string | null | undefined, timeZone: string = activeTimeZone) {
  const text = (value ?? "").trim();
  if (!text) return "";
  const match = NAIVE.exec(text);
  if (!match) {
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!Number.isFinite(wall)) return "";
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  // Two passes settle the offset around daylight-saving transitions.
  let instant = wall - zoneOffsetMinutes(wall, zone) * 60_000;
  instant = wall - zoneOffsetMinutes(instant, zone) * 60_000;
  return new Date(instant).toISOString();
}

/** Instant → "YYYY-MM-DDTHH:mm" in the agency zone, for datetime-local inputs. */
export function isoToZonedInput(value: string | Date | null | undefined, timeZone: string = activeTimeZone) {
  if (!value) return "";
  const instant = value instanceof Date ? value.getTime() : isNaiveDateTime(value) ? Date.parse(zonedWallTimeToIso(value, timeZone)) : Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * "Now" as a wall-clock Date: its local getters (getHours, getDate…) read the agency's
 * current wall time, so existing preset arithmetic (setHours(9), +1 day) produces agency
 * wall times regardless of the device's own zone. Format it with local getters or
 * `toWallInput`, never with toISOString.
 */
export function zonedNow(timeZone: string = activeTimeZone) {
  return new Date(isoToZonedInput(new Date(), timeZone));
}

/** Wall-clock Date (see zonedNow) → "YYYY-MM-DDTHH:mm". */
export function toWallInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Instant → "YYYY-MM-DD" calendar day in the agency zone. */
export function zonedDayKey(value: string | Date | number = new Date(), timeZone: string = activeTimeZone) {
  const instant = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  return isoToZonedInput(new Date(instant), timeZone).slice(0, 10);
}

/** Formats an instant in the agency zone. Naive strings are read as agency wall time. */
export function formatInZone(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions, timeZone: string = activeTimeZone, locale = "en-PK") {
  if (!value) return "";
  const instant = value instanceof Date ? value.getTime() : isNaiveDateTime(value) ? Date.parse(zonedWallTimeToIso(value, timeZone)) : Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(instant));
}

export function formatDateTimeInZone(value: string | Date | null | undefined, timeZone: string = activeTimeZone) {
  return formatInZone(value, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }, timeZone);
}
