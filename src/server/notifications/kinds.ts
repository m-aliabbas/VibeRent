export type NotificationKind =
  | "booking.agreement"
  | "booking.checkout_notice"
  | "booking.checkin_invoice"
  | "booking.payment_receipt"
  | "owner.payout_receipt"
  | "owner.expense_notice"
  | "owner.command_reply"
  | "report.daily";

export type NotificationStatus = "queued" | "rendering" | "ready" | "sending" | "sent" | "failed" | "skipped" | "cancelled";

type KindDefinition = {
  label: string;
  entityType: string;
  /** Audit actions kept identical to the pre-queue delivery code so activity history stays continuous. */
  sentAction?: string;
  failedAction?: string;
};

export const notificationKinds: Record<NotificationKind, KindDefinition> = {
  "booking.agreement": { label: "Rental agreement", entityType: "booking", sentAction: "booking.agreement_sent", failedAction: "booking.agreement_delivery_failed" },
  "booking.checkout_notice": { label: "Checkout receipt", entityType: "booking", sentAction: "booking.checkout_notice_sent", failedAction: "booking.checkout_notice_failed" },
  "booking.checkin_invoice": { label: "Final invoice", entityType: "booking", sentAction: "booking.checkin_invoice_sent", failedAction: "booking.checkin_invoice_failed" },
  "booking.payment_receipt": { label: "Payment receipt", entityType: "booking", sentAction: "booking.payment_invoice_sent", failedAction: "booking.payment_invoice_failed" },
  "owner.payout_receipt": { label: "Owner payout receipt", entityType: "owner", sentAction: "owner_payout_sent", failedAction: "owner_payout_failed" },
  "owner.expense_notice": { label: "Owner expense notice", entityType: "expense", sentAction: "expense.owner_notice_sent", failedAction: "expense.owner_notice_failed" },
  "owner.command_reply": { label: "Command reply", entityType: "whatsapp_message" },
  "report.daily": { label: "Daily report", entityType: "report", sentAction: "daily_report.sent", failedAction: "daily_report.failed" },
};

/** Delivery error codes. Never raw library messages: these are stored and shown to staff. */
export type DeliveryErrorCode =
  | "whatsapp_not_configured"
  | "whatsapp_not_connected"
  | "recipient_not_registered"
  | "recipient_missing"
  | "render_failed"
  | "delivery_failed"
  | "client_delivery";

/** Errors that will not fix themselves by retrying. */
export const permanentDeliveryErrors: DeliveryErrorCode[] = ["whatsapp_not_configured", "recipient_not_registered", "recipient_missing", "client_delivery"];

export function deliveryErrorCode(error: unknown): DeliveryErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not configured")) return "whatsapp_not_configured";
  if (message.includes("not registered")) return "recipient_not_registered";
  if (message.includes("not connected") || message.includes("reconnect") || message.includes("already active")) return "whatsapp_not_connected";
  return "delivery_failed";
}
