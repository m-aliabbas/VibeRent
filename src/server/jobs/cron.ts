/**
 * Minimal five-field cron matcher for the SQLite job runner (desktop/LAN). It supports `*`, numbers,
 * ranges `a-b`, steps `* /n` and `a-b/n`, and comma lists, which covers `jobSchedules`. The web
 * deployment uses pg-boss' own scheduler instead.
 */

export type ZonedMinute = { minute: number; hour: number; dayOfMonth: number; month: number; dayOfWeek: number };

const fieldRanges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function fieldMatches(field: string, value: number, [min, max]: [number, number]) {
  return field.split(",").some(part => {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step: ${part}`);
    let low = min;
    let high = max;
    if (range !== "*") {
      const [start, end] = range.split("-").map(Number);
      if (!Number.isInteger(start) || (end !== undefined && !Number.isInteger(end))) throw new Error(`Invalid cron field: ${part}`);
      low = start;
      high = end ?? (stepText === undefined ? start : max);
    }
    return value >= low && value <= high && (value - low) % step === 0;
  });
}

export function cronMatches(expression: string, at: ZonedMinute) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Cron expressions need five fields: ${expression}`);
  const values = [at.minute, at.hour, at.dayOfMonth, at.month, at.dayOfWeek];
  return fields.every((field, index) => fieldMatches(field, values[index], fieldRanges[index]));
}

/** The wall-clock minute in a time zone, plus a stable key for "this minute" used to dedupe runs. */
export function zonedMinute(date: Date, timeZone: string): ZonedMinute & { key: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
    }).formatToParts(date).map(part => [part.type, part.value]),
  );
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minute: Number(parts.minute),
    hour: Number(parts.hour),
    dayOfMonth: Number(parts.day),
    month: Number(parts.month),
    dayOfWeek: weekdays.indexOf(parts.weekday),
    key: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
  };
}
