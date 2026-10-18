import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiRequestContext } from "@/server/auth/session";
import { completeAuthorization } from "@/server/web-drive/web-drive-service";
export async function GET(request:Request){const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state"),jar=await cookies(),saved=jar.get("viberent_web_drive_state")?.value;jar.delete("viberent_web_drive_state");let outcome="error";try{if(!code||!state||!saved)throw new Error("Incomplete authorization");const context=await getApiRequestContext(request);await completeAuthorization(context,code,state,saved);outcome="connected"}catch{}return NextResponse.redirect(new URL(`/settings?tab=cloud-backup&drive=${outcome}`,process.env.BETTER_AUTH_URL||url.origin))}
