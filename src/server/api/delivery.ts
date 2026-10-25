import "server-only";
import { after } from "next/server";

/**
 * How customer/owner notices (agreement PDF, receipts, invoices) are delivered after a mutation.
 * - `server`: VibeRent sends them on WhatsApp in the background, after the response is returned.
 * - `client`: the caller shares the documents itself (for example from the phone's WhatsApp), so nothing is sent.
 *
 * Mobile sends `X-Delivery-Mode: client` when the agent will share from the device.
 */
export type DeliveryMode = "server" | "client";

export type QueuedDeliveryResult = { status: "queued" | "skipped"; message: string };

export function requestedDeliveryMode(request: Request): DeliveryMode {
  return request.headers.get("x-delivery-mode")?.trim().toLowerCase() === "client" ? "client" : "server";
}

/**
 * Runs a WhatsApp delivery after the response has been sent, so saving a booking, checkout,
 * check-in or payment never waits on WhatsApp. Delivery outcomes are still written to the audit log
 * by the delivery services themselves.
 */
export function deliverInBackground(mode: DeliveryMode, label: string, run: () => Promise<unknown>): QueuedDeliveryResult {
  if (mode === "client") return { status: "skipped", message: `${label} was not sent by VibeRent. Share it from the device.` };
  after(async () => {
    try {
      await run();
    } catch (error) {
      console.error(JSON.stringify({ event: "delivery.background_failed", label, message: error instanceof Error ? error.message : "unknown" }));
    }
  });
  return { status: "queued", message: `${label} is being sent on WhatsApp.` };
}
