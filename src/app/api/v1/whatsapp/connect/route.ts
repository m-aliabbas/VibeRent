import { apiHandler } from "@/server/api/route";
import { connectWhatsApp } from "@/server/services/whatsapp-settings-service";

export const runtime = "nodejs";

/** Owner-only. */
export const POST = apiHandler(({ context }) => connectWhatsApp(context), { revalidate: true });
