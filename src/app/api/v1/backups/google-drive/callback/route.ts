import { completeGoogleDriveAuthorization } from "@/server/desktop/google-drive-service";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function page(title: string, message: string, success: boolean) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui;padding:48px;background:#f8fafc;color:#19191f"><main style="max-width:520px;margin:auto;background:white;border:1px solid #e6eaf0;border-radius:12px;padding:28px"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p style="color:${success ? "#067647" : "#b42318"}">${success ? "You can close this window and return to VibeRent." : "Return to VibeRent and try connecting again."}</p></main><script>if(window.opener){window.opener.postMessage({type:'viberent-drive-connected'},window.location.origin)}</script></body></html>`, {
    status: success ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error || !code || !state) return page("Google Drive was not connected", "Authorization was cancelled or incomplete.", false);
  try {
    await completeGoogleDriveAuthorization(code, state);
    return page("Google Drive connected", "VibeRent can now store backups in the connected account.", true);
  } catch (cause) {
    return page("Google Drive was not connected", cause instanceof Error ? cause.message : "Authorization failed.", false);
  }
}
