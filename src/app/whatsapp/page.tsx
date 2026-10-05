import { WhatsAppWorkspace } from "@/components/whatsapp/whatsapp-workspace";
import { getWebRequestContext } from "@/server/auth/session";
import { getWhatsAppSettings } from "@/server/services/whatsapp-settings-service";

export default async function WhatsAppPage(){return <WhatsAppWorkspace initial={getWhatsAppSettings(await getWebRequestContext())}/>}
