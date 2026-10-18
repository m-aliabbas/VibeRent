import { WhatsAppWorkspace } from "@/components/whatsapp/whatsapp-workspace";
import { getWebRequestContext } from "@/server/auth/session";
import { getWhatsAppSettings } from "@/server/services/whatsapp-settings-service";

export default async function WhatsAppPage(){const context=await getWebRequestContext();return <WhatsAppWorkspace initial={await getWhatsAppSettings(context)} canManage={context.roles.includes("agency_owner")}/>}
