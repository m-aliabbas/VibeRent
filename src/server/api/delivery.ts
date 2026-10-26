import "server-only";

/**
 * How customer/owner notices (agreement PDF, receipts, invoices) are delivered after a mutation.
 * - `server`: VibeRent queues them and sends them on WhatsApp from a background job.
 * - `client`: the caller shares the documents itself (for example from the phone's WhatsApp), so nothing is sent.
 *
 * Mobile sends `X-Delivery-Mode: client` when the agent will share from the device.
 */
export type DeliveryMode = "server" | "client";

export type QueuedDeliveryResult = { status: "queued" | "skipped"; message: string; deliveryId?: string };

export function requestedDeliveryMode(request: Request): DeliveryMode {
  return request.headers.get("x-delivery-mode")?.trim().toLowerCase() === "client" ? "client" : "server";
}
