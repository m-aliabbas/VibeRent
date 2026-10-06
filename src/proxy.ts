import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-viberent-path", request.nextUrl.pathname);

  const isGoogleDriveCallback = request.nextUrl.pathname === "/"
    && request.nextUrl.searchParams.has("state")
    && (request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("error"));
  if (isGoogleDriveCallback) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/api/v1/backups/google-drive/callback";
    requestHeaders.set("x-viberent-path", callbackUrl.pathname);
    return NextResponse.rewrite(callbackUrl, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
