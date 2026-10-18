import { cookies } from "next/headers";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { getApiRequestContext } from "@/server/auth/session";
import { authorization } from "@/server/web-drive/web-drive-service";
export async function POST(request:Request){let requestId:string|undefined;try{const context=await getApiRequestContext(request);requestId=context.requestId;const result=await authorization(context);(await cookies()).set("viberent_web_drive_state",result.cookie,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/api/v1/agency-backup/google-drive"});return apiSuccess({authorizationUrl:result.url},requestId)}catch(error){return apiFailure(error,requestId)}}
