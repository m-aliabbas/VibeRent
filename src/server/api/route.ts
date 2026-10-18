import "server-only";
import { revalidatePath } from "next/cache";
import { apiFailure, apiSuccess, parseJsonRequest } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

type RouteParams = Record<string, string>;

type HandlerInput<P extends RouteParams> = { request: Request; context: RequestContext; params: P };

type HandlerOptions = {
  /** HTTP status for a successful response (default 200). */
  status?: number;
  /** Invalidate cached web pages after a mutation so the web app matches mobile changes. */
  revalidate?: boolean;
};

/**
 * Wraps an `/api/v1` Route Handler: authenticates the session, resolves route params,
 * and returns the shared `{ data, meta }` / `{ error }` envelope.
 */
export function apiHandler<P extends RouteParams = RouteParams>(
  run: (input: HandlerInput<P>) => Promise<unknown>,
  options: HandlerOptions = {},
) {
  return async (request: Request, route: { params: Promise<P> }) => {
    let requestId: string | undefined;
    try {
      const context = await getApiRequestContext(request);
      requestId = context.requestId;
      const params = (await route?.params) ?? ({} as P);
      const data = await run({ request, context, params });
      if (options.revalidate) revalidatePath("/", "layout");
      return apiSuccess(data, requestId, options.status ? { status: options.status } : undefined);
    } catch (error) {
      return apiFailure(error, requestId);
    }
  };
}

/** Parses a JSON body and requires it to be an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await parseJsonRequest(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError("VALIDATION_FAILED", "Request body must be a JSON object.", 400);
  }
  return body as Record<string, unknown>;
}

/** Parses an optional JSON body; an empty body yields `{}`. */
export async function readOptionalJsonObject(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-length") === "0" || !request.headers.get("content-type")) return {};
  return readJsonObject(request);
}

/** Parses a multipart body. */
export async function readMultipart(request: Request): Promise<FormData> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    throw new DomainError("VALIDATION_FAILED", "Content-Type must be multipart/form-data.", 415);
  }
  try { return await request.formData(); }
  catch { throw new DomainError("VALIDATION_FAILED", "Request body must be valid multipart form data.", 400); }
}

export function requireFile(form: FormData, field: string, message: string) {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) throw new DomainError("VALIDATION_FAILED", message, 400, { [field]: message });
  return file;
}

export function requireString(value: unknown, field: string, message: string) {
  if (typeof value !== "string" || !value.trim()) throw new DomainError("VALIDATION_FAILED", message, 400, { [field]: message });
  return value.trim();
}

/** Finds one record in a tenant-scoped list or throws 404. */
export function findOr404<T extends { id: string }>(items: T[], id: string, label: string) {
  const item = items.find(entry => entry.id === id);
  if (!item) throw new DomainError("NOT_FOUND", `${label} not found.`, 404);
  return item;
}

type OrganizationResult =
  | { ok: true; data?: unknown; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; code?: string; status?: number };

/**
 * Converts an organization Server Action result into the API envelope. Those actions hold
 * Better Auth calls that need the request headers, so routes reuse them rather than duplicate them.
 */
export function organizationResponse(result: OrganizationResult, options: HandlerOptions = {}) {
  const requestId = `req_${crypto.randomUUID()}`;
  if (result.ok) {
    if (options.revalidate) revalidatePath("/", "layout");
    return Response.json({ data: result.data ?? null, meta: { requestId, message: result.message ?? null } }, options.status ? { status: options.status } : undefined);
  }
  const status = result.status ?? 400;
  return Response.json(
    { error: { code: result.code ?? "VALIDATION_FAILED", message: result.message, fieldErrors: result.fieldErrors ?? {}, requestId } },
    { status },
  );
}
