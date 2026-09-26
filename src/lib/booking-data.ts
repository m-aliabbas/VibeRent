export type BookingStatus = "Draft" | "Confirmed" | "Checked Out" | "Completed" | "Cancelled" | "No Show";

export type BookingRecord = {
  id: string;
  customerId: string;
  customer: string;
  vehicleId: string;
  vehicle: string;
  plate: string;
  city: string;
  pickupAt: string;
  returnAt: string;
  dailyRate: number;
  days: number;
  extras: number;
  discount: number;
  tax: number;
  deposit: number;
  paid: number;
  status: BookingStatus;
  source: string;
  notes: string;
};

export type AvailabilityBlock = {
  id: string;
  vehicleId: string;
  from: string;
  to: string;
  reason: string;
  kind: "Booking" | "Maintenance" | "Manual block";
  bookingId?: string;
};

export const fleetOptions = [
  { id: "veh-1", label: "Toyota Corolla 2022", plate: "ICT-704", city: "Islamabad", rate: 9500 },
  { id: "veh-2", label: "Honda City 2023", plate: "LEB-218", city: "Lahore", rate: 11000 },
  { id: "veh-3", label: "KIA Sportage 2022", plate: "LHR-529", city: "Lahore", rate: 18000 },
  { id: "veh-4", label: "Suzuki Alto 2024", plate: "RIK-113", city: "Rawalpindi", rate: 7100 },
  { id: "veh-5", label: "Toyota Yaris 2023", plate: "BKC-882", city: "Karachi", rate: 9250 },
];

export const bookingRecords: BookingRecord[] = [
  { id: "BKG-1051", customerId: "CUS-194", customer: "Hamza Siddiqui", vehicleId: "veh-1", vehicle: "Toyota Corolla 2022", plate: "ICT-704", city: "Islamabad", pickupAt: "2026-09-26T10:00", returnAt: "2026-09-29T18:00", dailyRate: 9500, days: 3, extras: 2500, discount: 2500, tax: 0, deposit: 30000, paid: 28500, status: "Checked Out", source: "Walk-in", notes: "Return to Islamabad Blue Area branch." },
  { id: "BKG-1048", customerId: "CUS-218", customer: "Areeba Khan", vehicleId: "veh-2", vehicle: "Honda City 2023", plate: "LEB-218", city: "Lahore", pickupAt: "2026-09-28T09:00", returnAt: "2026-10-01T17:00", dailyRate: 11000, days: 3, extras: 1000, discount: 0, tax: 0, deposit: 25000, paid: 17000, status: "Confirmed", source: "Phone", notes: "Child seat requested." },
  { id: "BKG-1042", customerId: "CUS-176", customer: "Daniyal Shah", vehicleId: "veh-3", vehicle: "KIA Sportage 2022", plate: "LHR-529", city: "Lahore", pickupAt: "2026-09-23T10:00", returnAt: "2026-09-26T10:00", dailyRate: 18000, days: 3, extras: 0, discount: 0, tax: 0, deposit: 50000, paid: 54000, status: "Completed", source: "Referral", notes: "Completed without incident." },
  { id: "BKG-1036", customerId: "CUS-176", customer: "Maham Ali", vehicleId: "veh-4", vehicle: "Suzuki Alto 2024", plate: "RIK-113", city: "Rawalpindi", pickupAt: "2026-09-20T12:00", returnAt: "2026-09-22T12:00", dailyRate: 7100, days: 2, extras: 0, discount: 0, tax: 0, deposit: 15000, paid: 14200, status: "Completed", source: "Website", notes: "Preferred customer." },
  { id: "BKG-1031", customerId: "CUS-143", customer: "Zain Ahmed", vehicleId: "veh-5", vehicle: "Toyota Yaris 2023", plate: "BKC-882", city: "Karachi", pickupAt: "2026-09-18T09:00", returnAt: "2026-09-20T18:00", dailyRate: 9250, days: 2, extras: 0, discount: 0, tax: 0, deposit: 20000, paid: 5000, status: "Cancelled", source: "Website", notes: "Cancellation refund review required." },
];

export const manualBlocks: AvailabilityBlock[] = [
  { id: "BLK-31", vehicleId: "veh-3", from: "2026-09-30T08:00", to: "2026-10-02T18:00", reason: "Scheduled service", kind: "Maintenance" },
  { id: "BLK-32", vehicleId: "veh-5", from: "2026-09-27T08:00", to: "2026-09-29T18:00", reason: "Owner use", kind: "Manual block" },
];

export function intervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA).getTime() < new Date(endB).getTime() && new Date(endA).getTime() > new Date(startB).getTime();
}

export function getVehicleConflicts(vehicleId: string, from: string, to: string, excludeBookingId?: string) {
  const bookingConflicts: AvailabilityBlock[] = bookingRecords
    .filter((booking) => booking.vehicleId === vehicleId && booking.id !== excludeBookingId && !["Cancelled", "No Show", "Draft"].includes(booking.status) && intervalsOverlap(from, to, booking.pickupAt, booking.returnAt))
    .map((booking) => ({ id: booking.id, vehicleId, from: booking.pickupAt, to: booking.returnAt, reason: `${booking.customer} · ${booking.status}`, kind: "Booking", bookingId: booking.id }));
  return [...bookingConflicts, ...manualBlocks.filter((block) => block.vehicleId === vehicleId && intervalsOverlap(from, to, block.from, block.to))];
}

export function bookingTotal(booking: Pick<BookingRecord, "dailyRate" | "days" | "extras" | "discount" | "tax">) {
  return booking.dailyRate * booking.days + booking.extras - booking.discount + booking.tax;
}
