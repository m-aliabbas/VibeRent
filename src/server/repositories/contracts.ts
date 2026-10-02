import type { Vehicle } from "@/types/vehicle";

export interface VehicleRepository {
  list(agencyId: string): Vehicle[];
  getById(agencyId: string, id: string): Vehicle | undefined;
  save(agencyId: string, actorId: string, vehicle: Vehicle): Vehicle;
}

export type BookingListItem = {
  id: string;
  customerId: string;
  customer: string;
  vehicleId: string;
  vehicle: string;
  plate: string;
  city: string;
  destinationCity: string;
  pickupAt: string;
  returnAt: string;
  dailyRate: number;
  days: number;
  extras: number;
  discount: number;
  tax: number;
  deposit: number;
  paid: number;
  depositHeld?: number;
  transactions?: BookingTransactionDto[];
  status: "Draft" | "Confirmed" | "Checked Out" | "Completed" | "Cancelled" | "No Show";
  source: string;
  notes: string;
  estimatedKm: number;
  mileageRate: number;
  pricingMode: string;
  rateOverrideReason: string;
  termsSnapshot: string;
  version: number;
  inspections?: BookingInspectionDto[];
};

export type BookingInspectionDto = {
  kind: "checkout" | "checkin";
  odometer: number;
  fuelLevel: string;
  conditionNotes: string;
  occurredAt: string;
};

export type BookingTransactionDto = {
  id: string;
  bookingId: string;
  customerId: string;
  kind: string;
  amount: number;
  method: string;
  reference: string;
  account?: string | null;
  note?: string | null;
  linkedTransactionId?: string | null;
  status: string;
  postedAt: string;
  createdAt: string;
};
