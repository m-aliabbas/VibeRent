import "server-only";

import { inTransaction } from "@/db/query";
import type { RequestContext } from "@/server/context/request-context";
import { jobDefinitions, type JobContext } from "@/server/jobs/contracts";
import { enqueueJob } from "@/server/jobs/queue";
import { auditDelivery, loadDelivery, updateDelivery, type NotificationDeliveryRow } from "@/server/notifications/notification-service";
import { renderNotification } from "@/server/services/notification-delivery-service";
import { storeSystemFile } from "@/server/services/private-file-service";

/** The agency-scoped context a job renders with. The job acts for the agency, not for a signed-in user. */
export function systemContext(delivery: Pick<NotificationDeliveryRow, "agencyId" | "requestedBy">, jobId: string): RequestContext {
  return { requestId: jobId, userId: delivery.requestedBy ?? "", agencyId: delivery.agencyId, roles: ["agency_owner"] };
}

/** Worker job: build the PDF or text for a delivery, store it, then hand it to the WhatsApp gateway. */
export async function renderNotificationJob({ deliveryId }: { deliveryId: string }, job: JobContext) {
  const delivery = await loadDelivery(deliveryId);
  // A rendering row was interrupted mid-run and is safe to render again.
  if (!delivery || (delivery.status !== "queued" && delivery.status !== "rendering")) return;
  await updateDelivery(deliveryId, { status: "rendering" });

  let rendered;
  try {
    rendered = await renderNotification(systemContext(delivery, job.jobId), delivery);
  } catch (error) {
    if (job.attempt <= jobDefinitions["notify.render"].retryLimit) throw error;
    await updateDelivery(deliveryId, { status: "failed", last_error_code: "render_failed" });
    await auditDelivery(delivery, "failed", { reason: "render_failed" });
    console.error(JSON.stringify({ event: "notification.render_failed", deliveryId, kind: delivery.kind, message: error instanceof Error ? error.message : "unknown" }));
    return;
  }

  if (rendered.status === "skipped") {
    await updateDelivery(deliveryId, { status: "skipped", last_error_code: "recipient_missing" });
    return;
  }

  const documentFileId = rendered.document
    ? await storeSystemFile({
      agencyId: delivery.agencyId, entityType: "notification", entityId: deliveryId, bytes: rendered.document.bytes,
      originalName: rendered.document.fileName, mimeType: "application/pdf", classification: "notification_document",
    })
    : null;

  await inTransaction(async () => {
    await updateDelivery(deliveryId, {
      status: "ready", recipient_phone: rendered.phone, recipient_name: rendered.recipientName, document_file_id: documentFileId,
      message_text: rendered.text ?? null, file_name: rendered.document?.fileName ?? null, caption: rendered.caption ?? null,
    });
    await enqueueJob("wa.send", { deliveryId }, { singletonKey: deliveryId });
  }, { immediate: true });
}
