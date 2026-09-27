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
  pickupAt: string;
  returnAt: string;
  dailyRate: number;
  days: number;
  extras: number;
  discount: number;
  tax: number;
  deposit: number;
  paid: number;
  status: "Draft" | "Confirmed" | "Checked Out" | "Completed" | "Cancelled" | "No Show";
  source: string;
  notes: string;
};

