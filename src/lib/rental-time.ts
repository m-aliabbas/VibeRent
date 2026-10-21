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

export type EarlyReturnAdjustment = {
  early: boolean;
  bookedDays: number;
  usedDays: number;
  unusedDays: number;
  totalAmount: number;
  reduction: number;
};

/** Re-prices a rental on the days actually used when it comes back before the agreed return. */
export function calculateEarlyReturn(input: {
  pickupAt: string;
  returnAt: string;
  returnedAt: string | Date;
  dailyRate: number;
  mileageRate: number;
  estimatedKm: number;
  extras: number;
  discount: number;
  totalAmount: number;
}): EarlyReturnAdjustment {
  const pickup = Date.parse(input.pickupAt);
  const agreed = Date.parse(input.returnAt);
  const actual = input.returnedAt instanceof Date ? input.returnedAt.getTime() : Date.parse(input.returnedAt);
  const bookedDays = Math.max(1, Math.ceil((agreed - pickup) / 86_400_000));
  const usedDays = Number.isFinite(actual) ? Math.min(bookedDays, Math.max(1, Math.ceil((actual - pickup) / 86_400_000))) : bookedDays;
  if (!Number.isFinite(actual) || actual >= agreed || usedDays >= bookedDays) {
    return { early: false, bookedDays, usedDays: bookedDays, unusedDays: 0, totalAmount: input.totalAmount, reduction: 0 };
  }
  const totalAmount = Math.max(0, Math.min(input.totalAmount, input.dailyRate * usedDays + input.mileageRate * input.estimatedKm + input.extras - input.discount));
  return { early: true, bookedDays, usedDays, unusedDays: bookedDays - usedDays, totalAmount, reduction: input.totalAmount - totalAmount };
}
