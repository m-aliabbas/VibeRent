import { asDomainError } from "@/server/domain/errors";
import { DomainError } from "@/server/domain/errors";

export function apiSuccess<T>(data: T, requestId: string, init?: ResponseInit) {
  return Response.json({ data, meta: { requestId } }, init);
}

export function apiFailure(error: unknown, requestId = `req_${crypto.randomUUID()}`) {
  const failure = asDomainError(error);
  if (failure.status >= 500) console.error(JSON.stringify({ requestId, code: failure.code }));
  return Response.json(
    {
      error: {
        code: failure.code,
        message: failure.message,
        fieldErrors: failure.fieldErrors ?? {},
        requestId,
      },
    },
    { status: failure.status },
  );
}

export async function parseJsonRequest(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new DomainError("VALIDATION_FAILED", "Content-Type must be application/json.", 415);
  }
  try { return await request.json(); }
  catch { throw new DomainError("VALIDATION_FAILED", "Request body must contain valid JSON.", 400); }
}
