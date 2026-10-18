import { apiHandler } from "@/server/api/route";
import { disconnectWhatsApp } from "@/server/services/whatsapp-settings-service";

export const runtime = "nodejs";

/** Owner-only. */
export const POST = apiHandler(({ context }) => disconnectWhatsApp(context), { revalidate: true });
