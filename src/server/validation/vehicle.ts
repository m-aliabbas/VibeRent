import type { Vehicle } from "@/types/vehicle";
import { DomainError } from "@/server/domain/errors";

const categories = ["Economy", "Sedan", "SUV"];
const cities = ["Lahore", "Islamabad", "Rawalpindi", "Karachi"];
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
  if (!input.make?.trim()) errors.make = "Make is required.";
  if (!input.model?.trim()) errors.model = "Model is required.";
  if (!Number.isInteger(input.year) || input.year! < 2000 || input.year! > 2035) errors.year = "Enter a valid model year.";
  if (!Number.isInteger(input.dailyRate) || input.dailyRate! < 1000) errors.dailyRate = "Daily rate must be at least PKR 1,000.";
  if (!categories.includes(input.category ?? "")) errors.category = "Choose a valid category.";
  if (!cities.includes(input.city ?? "")) errors.city = "Choose a supported city.";
  if (!statuses.includes(input.status ?? "")) errors.status = "Choose a valid status.";
  if (!ownerships.includes(input.ownership ?? "")) errors.ownership = "Choose a valid ownership type.";
  if (!transmissions.includes(input.transmission ?? "")) errors.transmission = "Choose a valid transmission.";
  if (!fuels.includes(input.fuel ?? "")) errors.fuel = "Choose a valid fuel type.";
  if (input.ownership === "Managed" && !input.owner?.trim()) errors.owner = "A managed vehicle requires an owner.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the highlighted fields.", 400, errors);
  return {
    ...input,
    id: typeof input.id === "string" ? input.id : "",
    plate: input.plate!.trim().toUpperCase(),
    make: input.make!.trim(),
    model: input.model!.trim(),
    color: input.color?.trim() || "Not specified",
  } as Vehicle;
}

