export type RecurringFrequency = "monthly" | "quarterly" | "yearly";

export const recurringFrequencies: Array<{ value: RecurringFrequency; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Yearly" },
];

const stepMonths: Record<RecurringFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** The nth occurrence (0-based) counted from the start month, clamped to the last day of short months. */
export function occurrenceOn(startOn: string, frequency: RecurringFrequency, dayOfMonth: number, index: number) {
  const [year, month] = startOn.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + index * stepMonths[frequency];
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(dayOfMonth, lastDay))}`;
}

/** First occurrence on or after `date` (YYYY-MM-DD). */
export function nextOccurrenceOnOrAfter(startOn: string, frequency: RecurringFrequency, dayOfMonth: number, date: string) {
  for (let index = 0; index < 2400; index += 1) {
    const candidate = occurrenceOn(startOn, frequency, dayOfMonth, index);
    if (candidate >= date && candidate >= startOn) return candidate;
  }
  throw new Error("Recurring schedule is out of range.");
}

/** Occurrence that follows `date`, which must itself be an occurrence. */
export function occurrenceAfter(startOn: string, frequency: RecurringFrequency, dayOfMonth: number, date: string) {
  const [startYear, startMonth] = startOn.split("-").map(Number);
  const [year, month] = date.split("-").map(Number);
  const index = Math.round(((year - startYear) * 12 + (month - startMonth)) / stepMonths[frequency]);
  return occurrenceOn(startOn, frequency, dayOfMonth, index + 1);
}

export function describeSchedule(frequency: RecurringFrequency, dayOfMonth: number) {
  const day = `${dayOfMonth}${dayOfMonth % 10 === 1 && dayOfMonth !== 11 ? "st" : dayOfMonth % 10 === 2 && dayOfMonth !== 12 ? "nd" : dayOfMonth % 10 === 3 && dayOfMonth !== 13 ? "rd" : "th"}`;
  const label = frequency === "monthly" ? "Monthly" : frequency === "quarterly" ? "Every 3 months" : "Yearly";
  return `${label} on the ${day}${dayOfMonth > 28 ? " (or last day)" : ""}`;
}

export function todayInPakistan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
