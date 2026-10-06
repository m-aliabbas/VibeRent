export function formatPaymentReceiptNumber(receiptNumber: number) {
  return `RCT-${receiptNumber.toString().padStart(6, "0")}`;
}
