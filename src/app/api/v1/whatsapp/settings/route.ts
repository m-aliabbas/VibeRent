import { apiHandler, readJsonObject } from "@/server/api/route";
import { saveWhatsAppSettings } from "@/server/services/whatsapp-settings-service";

export const runtime = "nodejs";

/** Owner-only. Body: `{ ownerNumber, listeningEnabled }`. */
export const PUT = apiHandler(async ({ request, context }) => {
  const body = await readJsonObject(request);
  return saveWhatsAppSettings(context, { ownerNumber: String(body.ownerNumber ?? ""), listeningEnabled: body.listeningEnabled === true });
}, { revalidate: true });
