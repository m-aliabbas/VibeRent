export type VehicleStatus =
  | "Available"
  | "Booked"
  | "Maintenance"
  | "Out of Service"
  | "Archived";
export type Ownership = "Own" | "Managed";

export type ManagementAgreement = {
  ownerId: string;
  effectiveFrom: string;
  effectiveTo: string;
  shareMethod: "Percentage" | "Fixed monthly";
  ownerShare: number;
  expenseResponsibility: "Agency" | "Owner" | "Shared";
  payoutFrequency: "Monthly" | "Fortnightly";
};

export type VehicleRateRule = {
  destinationCity: string;
  dailyRate: number;
  perKmRate: number;
  minimumDays: number;
};

export type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  category: "Economy" | "Sedan" | "SUV";
  city: string;
  ownership: Ownership;
  status: VehicleStatus;
  dailyRate: number;
  color: string;
  transmission: "Automatic" | "Manual";
  fuel: "Petrol" | "Hybrid" | "Diesel";
  ownerId?: string;
  owner?: string;
  agreement?: ManagementAgreement;
  rateRules?: VehicleRateRule[];
};
