import { apiHandler } from "@/server/api/route";
import { resetWhatsApp } from "@/server/services/whatsapp-settings-service";

export const runtime = "nodejs";

/** Owner-only. */
export const POST = apiHandler(({ context }) => resetWhatsApp(context), { revalidate: true });
