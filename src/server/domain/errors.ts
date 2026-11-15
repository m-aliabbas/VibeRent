export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "BOOKING_CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function asDomainError(error: unknown) {
  if (error instanceof DomainError) return error;
  // Unexpected failure: log a short, PII-free trace with a reference the user can quote,
  // instead of swallowing the cause. No SQL, payloads or customer data are logged.
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message.split(/\bSQL\b|\n/)[0].slice(0, 160) : "";
  const where = error instanceof Error ? (error.stack ?? "").split("\n").slice(1, 3).map((line) => line.trim()).join(" | ") : "";
  console.error(`[viberent:error] ref=${ref} type=${name}${code ? ` code=${String(code)}` : ""} msg="${message}" at=${where}`);
  return new DomainError("INTERNAL_ERROR", `The operation could not be completed. Reference ${ref}.`, 500);
}
