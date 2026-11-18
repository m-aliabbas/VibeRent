"use server";
import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { notices, withNotices } from "@/server/notifications/notices";
import { archiveQuotation, getQuotation, listQuotations, saveQuotation, setQuotationStatus, type QuotationInput } from "@/server/services/quotation-service";

function failure(error: unknown) { const issue = asDomainError(error); return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } }; }

export async function listQuotationsAction() { try { return { ok: true as const, data: await listQuotations(await getWebRequestContext()) }; } catch (error) { return failure(error); } }
export async function saveQuotationAction(input: QuotationInput) { try { const data = await saveQuotation(await getWebRequestContext(), input); revalidatePath("/quotations"); return { ok: true as const, data }; } catch (error) { return failure(error); } }
export async function setQuotationStatusAction(id: string, status: string) { try { const data = await setQuotationStatus(await getWebRequestContext(), id, status); revalidatePath("/quotations"); return { ok: true as const, data }; } catch (error) { return failure(error); } }
export async function archiveQuotationAction(id: string) { try { const data = await archiveQuotation(await getWebRequestContext(), id); revalidatePath("/quotations"); return { ok: true as const, data }; } catch (error) { return failure(error); } }

/** Queues the quotation PDF to the customer's WhatsApp and marks a draft quote as sent. */
export async function sendQuotationAction(id: string) {
  try {
    const context = await getWebRequestContext();
    const data = await withNotices(async () => {
      const current = await getQuotation(context, id);
      return { quote: current.status === "draft" || current.status === "expired" ? await setQuotationStatus(context, id, "sent") : current };
    }, async () => ({ notificationDelivery: await notices.quotation(context, "server", id) }));
    revalidatePath("/quotations");
    return { ok: true as const, data };
  } catch (error) { return failure(error); }
}
