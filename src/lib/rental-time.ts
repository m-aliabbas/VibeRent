export type LateReturnDuration = {
  late: boolean;
  minutes: number;
  hours: number;
  remainingMinutes: number;
};

export function calculateLateReturn(returnAt: string, checkedInAt: string | Date = new Date()): LateReturnDuration {
  const agreed = Date.parse(returnAt);
  const actual = checkedInAt instanceof Date ? checkedInAt.getTime() : Date.parse(checkedInAt);
  if (!Number.isFinite(agreed) || !Number.isFinite(actual) || actual <= agreed) {
    return { late: false, minutes: 0, hours: 0, remainingMinutes: 0 };
  }
  const minutes = Math.ceil((actual - agreed) / 60_000);
  return { late: true, minutes, hours: Math.floor(minutes / 60), remainingMinutes: minutes % 60 };
}

export function formatLateReturnDuration(duration: LateReturnDuration) {
  if (!duration.late) return "On time";
  const parts=[];
  if(duration.hours)parts.push(`${duration.hours} hr${duration.hours===1?"":"s"}`);
  if(duration.remainingMinutes)parts.push(`${duration.remainingMinutes} min`);
  return parts.join(" ") || "Less than 1 min";
}
