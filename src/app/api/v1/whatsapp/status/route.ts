import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { getWhatsAppSettings } from "@/server/services/whatsapp-settings-service";

export const runtime="nodejs";
export async function GET(request:Request){let requestId:string|undefined;try{const context=await getApiRequestContext(request);requestId=context.requestId;return apiSuccess(getWhatsAppSettings(context),requestId)}catch(error){return apiFailure(error,requestId)}}
