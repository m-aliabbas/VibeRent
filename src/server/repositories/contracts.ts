import type { Vehicle } from "@/types/vehicle";

export interface VehicleRepository {
  list(agencyId: string): Vehicle[];
  getById(agencyId: string, id: string): Vehicle | undefined;
  save(agencyId: string, actorId: string, vehicle: Vehicle): Vehicle;
}

export type BookingListItem = {
  id: string;
  publicNumber: number | null;
  customerId: string;
  customer: string;
  customerCnic?: string;
  customerPhone?: string;
  rentalMode?: "self_drive"|"with_driver";
  driverId?: string|null;
  driver?: string|null;
  renterSkipped?: boolean;
  guarantor?: {
    name: string;
    parentage: string;
    cnic: string;
    phone: string;
    address: string;
    carAmount: number;
  };
  vehicleId: string;
  vehicle: string;
  plate: string;
  fulfillmentType: "fleet" | "external";
  externalSupplierName?: string;
  externalSupplierPhone?: string;
  supplierPricingMode?: "percentage" | "fixed";
  supplierSharePercent?: number;
  supplierFixedCost?: number;
  supplierPayable?: number;
  supplierPaid?: number;
  supplierBalance?: number;
  sourcePayouts?: SourcePayoutDto[];
  city: string;
  destinationCity: string;
  pickupAt: string;
  returnAt: string;
  dailyRate: number;
  totalAmount: number;
  days: number;
  extras: number;
  discount: number;
  tax: number;
  deposit: number;
  paid: number;
  paymentStatus?: "Unpaid" | "Partially paid" | "Paid" | "Payment reversed";
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
  lastVehicleOdometer?: number;
};

export type SourcePayoutDto = {
  id: string;
  amount: number;
  method: string;
  reference: string;
  status: string;
  paidAt: string;
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
  receiptNumber?: number | null;
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
