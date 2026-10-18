import { apiFailure, apiSuccess } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import { status } from "@/server/web-drive/web-drive-service";
export async function GET(request:Request){let requestId:string|undefined;try{const context=await getApiRequestContext(request);requestId=context.requestId;return apiSuccess(await status(context),requestId)}catch(error){return apiFailure(error,requestId)}}
