import { DomainError } from "@/server/domain/errors";

export type CreateCustomerInput = {
  name: string;
  phone: string;
  cnic: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiresAt?: string;
};

export function parseCreateCustomerInput(value: unknown): CreateCustomerInput & { phoneNormalized: string; cnicNormalized: string } {
  const input = value as Partial<CreateCustomerInput> | null;
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid customer payload.", 400);
  const errors: Record<string, string> = {};
  const name = input.name?.trim() ?? "";
  const phoneNormalized = input.phone?.replace(/\D/g, "") ?? "";
  const cnicNormalized = input.cnic?.replace(/\D/g, "") ?? "";
  if (name.length < 2) errors.name = "Enter the customer's full name.";
  if (phoneNormalized.length < 10 || phoneNormalized.length > 13) errors.phone = "Enter a valid phone number.";
  if (cnicNormalized.length !== 13) errors.cnic = "CNIC must contain 13 digits.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "Enter a valid email address.";
  if (input.licenseExpiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.licenseExpiresAt)) errors.licenseExpiresAt = "Use YYYY-MM-DD.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the customer details.", 400, errors);
  return {
    name,
    phone: input.phone!.trim(),
    phoneNormalized,
    cnic: input.cnic!.trim(),
    cnicNormalized,
    email: input.email?.trim() || undefined,
    licenseNumber: input.licenseNumber?.trim() || undefined,
    licenseExpiresAt: input.licenseExpiresAt,
  };
}
