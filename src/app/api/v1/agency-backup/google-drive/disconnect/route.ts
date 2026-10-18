import { apiFailure, apiSuccess } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import { disconnect } from "@/server/web-drive/web-drive-service";
export async function DELETE(request:Request){let requestId:string|undefined;try{const context=await getApiRequestContext(request);requestId=context.requestId;return apiSuccess(await disconnect(context),requestId)}catch(error){return apiFailure(error,requestId)}}
