export type OilChangeState = "not_recorded" | "ok" | "due_soon" | "overdue";

export type OilChangeSummary = {
  state: OilChangeState;
  intervalKm: number;
  lastOdometer?: number;
  currentOdometer?: number;
  nextDueKm?: number;
  remainingKm?: number;
};

/** Warn once the vehicle is within 10% of its interval (at least 500 km) of the next change. */
export function dueSoonThreshold(intervalKm: number) {
  return Math.max(500, Math.round(intervalKm * 0.1));
}

export function summarizeOilChange(intervalKm: number, lastOilChangeOdometer?: number | null, latestReading?: number | null): OilChangeSummary {
  const lastOdometer = lastOilChangeOdometer ?? undefined;
  const readings = [lastOilChangeOdometer, latestReading].filter((value): value is number => typeof value === "number");
  const currentOdometer = readings.length ? Math.max(...readings) : undefined;
  if (lastOdometer === undefined) return { state: "not_recorded", intervalKm, currentOdometer };
  const nextDueKm = lastOdometer + intervalKm;
  const remainingKm = nextDueKm - (currentOdometer ?? lastOdometer);
  const state: OilChangeState = remainingKm <= 0 ? "overdue" : remainingKm <= dueSoonThreshold(intervalKm) ? "due_soon" : "ok";
  return { state, intervalKm, lastOdometer, currentOdometer, nextDueKm, remainingKm };
}

export const oilChangeLabels: Record<OilChangeState, string> = {
  not_recorded: "No oil change recorded",
  ok: "Oil change OK",
  due_soon: "Oil change due soon",
  overdue: "Oil change overdue",
};

export function needsOilChange(summary?: OilChangeSummary) {
  return summary?.state === "due_soon" || summary?.state === "overdue";
}
