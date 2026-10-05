import type { Vehicle } from "@/types/vehicle";
import { DomainError } from "@/server/domain/errors";

const categories = ["Economy", "Sedan", "SUV"];
const statuses = ["Available", "Booked", "Maintenance", "Out of Service", "Archived"];
const ownerships = ["Own", "Managed"];
const transmissions = ["Automatic", "Manual"];
const fuels = ["Petrol", "Hybrid", "Diesel"];

export function parseVehicleInput(value: unknown): Vehicle {
  const input = value as Partial<Vehicle> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") {
    throw new DomainError("VALIDATION_FAILED", "Invalid vehicle payload.", 400);
  }
  if (!input.plate?.trim()) errors.plate = "Plate number is required.";
  if (!input.chassisNumber?.trim()) errors.chassisNumber = "Chassis number is required.";
  if (!input.engineNumber?.trim()) errors.engineNumber = "Engine number is required.";
  if (!input.make?.trim()) errors.make = "Make is required.";
  if (!input.model?.trim()) errors.model = "Model is required.";
  if (!Number.isInteger(input.year) || input.year! < 2000 || input.year! > 2035) errors.year = "Enter a valid model year.";
  if (!Number.isInteger(input.dailyRate) || input.dailyRate! < 1000) errors.dailyRate = "Daily rate must be at least PKR 1,000.";
  if (!Number.isInteger(input.withDriverRate) || input.withDriverRate! < input.dailyRate!) errors.withDriverRate = "With-driver rate must be at least the self-drive rate.";
  if (!categories.includes(input.category ?? "")) errors.category = "Choose a valid category.";
  if (!input.city?.trim()) errors.city = "City is required.";
  if (!statuses.includes(input.status ?? "")) errors.status = "Choose a valid status.";
  if (!ownerships.includes(input.ownership ?? "")) errors.ownership = "Choose a valid ownership type.";
  if (!transmissions.includes(input.transmission ?? "")) errors.transmission = "Choose a valid transmission.";
  if (!fuels.includes(input.fuel ?? "")) errors.fuel = "Choose a valid fuel type.";
  if (input.ownership === "Managed" && !input.ownerId?.trim()) errors.owner = "A managed vehicle requires an owner.";
  for (const [index, rule] of (input.rateRules ?? []).entries()) {
    if (!rule.destinationCity?.trim()) errors[`rateRules.${index}.destinationCity`] = "Enter a destination city.";
    if (!Number.isInteger(rule.dailyRate) || rule.dailyRate < 1000) errors[`rateRules.${index}.dailyRate`] = "Enter a valid daily rate.";
    if (!Number.isInteger(rule.perKmRate) || rule.perKmRate < 0) errors[`rateRules.${index}.perKmRate`] = "Mileage rate cannot be negative.";
    if (!Number.isInteger(rule.minimumDays) || rule.minimumDays < 1) errors[`rateRules.${index}.minimumDays`] = "Minimum days must be at least one.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the highlighted fields.", 400, errors);
  return {
    ...input,
    id: typeof input.id === "string" ? input.id : "",
    plate: input.plate!.trim().toUpperCase(),
    chassisNumber: input.chassisNumber!.trim().toUpperCase(),
    engineNumber: input.engineNumber!.trim().toUpperCase(),
    make: input.make!.trim(),
    model: input.model!.trim(),
    color: input.color?.trim() || "Not specified",
  } as Vehicle;
}
