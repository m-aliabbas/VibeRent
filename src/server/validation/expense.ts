import { DomainError } from "@/server/domain/errors";

export type CreateExpenseInput = {
  vehicleId?: string;
  bookingId?: string;
  ownerId?: string;
  amount: number;
  category: string;
  description: string;
  occurredOn: string;
};

export const expenseStatuses = ["draft", "submitted", "approved", "rejected", "reversed"] as const;
export type ExpenseStatus = (typeof expenseStatuses)[number];

export function parseCreateExpenseInput(value: unknown): CreateExpenseInput {
  const input = value as Partial<CreateExpenseInput> | null;
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid expense payload.", 400);
  const errors: Record<string, string> = {};
  if (!Number.isInteger(input.amount) || input.amount! <= 0) errors.amount = "Amount must be a positive whole PKR value.";
  if (!input.category?.trim()) errors.category = "Category is required.";
  if (!input.description?.trim()) errors.description = "Description is required.";
  if (!input.occurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn) || !Number.isFinite(Date.parse(`${input.occurredOn}T00:00:00Z`))) errors.occurredOn = "Use a valid YYYY-MM-DD date.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the expense details.", 400, errors);
  return {
    vehicleId: input.vehicleId?.trim() || undefined,
    bookingId: input.bookingId?.trim() || undefined,
    ownerId: input.ownerId?.trim() || undefined,
    amount: input.amount!, category: input.category!.trim(), description: input.description!.trim(), occurredOn: input.occurredOn!,
  };
}
