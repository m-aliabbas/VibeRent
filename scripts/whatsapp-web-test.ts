import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import QRCode from "qrcode";
import { getWhatsAppImageInboxPath } from "../src/server/desktop/runtime-paths";
import {
  parseAddImageCommand,
  saveAddImageCommand,
  WhatsAppService,
  whatsAppJidUser,
  type IncomingWhatsAppMessage,
  type WhatsAppConnectionStatus,
} from "../src/server/whatsapp";

const host = "127.0.0.1";
const configuredPort = Number(process.env.WHATSAPP_TEST_PORT ?? 4399);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 4399;
const token = randomBytes(24).toString("hex");
const maxBodyBytes = 20 * 1024 * 1024;
const maxMessages = 50;

type TestMessage = {
  id: string;
  senderJid: string;
  receivedAt: string;
  text?: string;
  media?: { kind: "image" | "document"; mimeType?: string; fileName?: string };
  imageSave?: {
    status: "saving" | "saved" | "failed";
    folder?: string;
    fileName?: string;
    absolutePath?: string;
    error?: string;
  };
};

type TestState = {
  status: WhatsAppConnectionStatus;
  qrDataUrl: string | null;
  qrUpdatedAt: string | null;
  connectedJid: string | null;
  lastError: string | null;
  messages: TestMessage[];
};

const state: TestState = {
  status: "idle",
  qrDataUrl: null,
  qrUpdatedAt: null,
  connectedJid: null,
  lastError: null,
  messages: [],
};
const mediaDownloads = new Map<string, IncomingWhatsAppMessage["media"]>();
const service = new WhatsAppService({
  sessionId: process.env.WHATSAPP_SESSION_ID ?? "web-test",
  checkRecipientBeforeSending: true,
});

service.on("status", (status: WhatsAppConnectionStatus) => {
  state.status = status;
  if (status === "connected" || status === "logged_out") {
    state.qrDataUrl = null;
    state.qrUpdatedAt = null;
  }
});
service.on("qr", (qr: string) => {
  void QRCode.toDataURL(qr, { width: 320, margin: 2, errorCorrectionLevel: "M" })
    .then((dataUrl) => {
      state.qrDataUrl = dataUrl;
      state.qrUpdatedAt = new Date().toISOString();
      state.lastError = null;
    })
    .catch((error: unknown) => {
      state.lastError = errorMessage(error);
    });
});
service.on("connected", ({ jid }: { jid?: string }) => {
  state.connectedJid = jid ? whatsAppJidUser(jid) : null;
  state.qrDataUrl = null;
  state.qrUpdatedAt = null;
  state.lastError = null;
});
service.on("disconnected", ({ loggedOut }: { loggedOut: boolean }) => {
  state.connectedJid = null;
  if (loggedOut) state.lastError = "WhatsApp logged this linked device out. Start pairing again.";
});
service.on("message", (message: IncomingWhatsAppMessage) => {
  void handleIncomingMessage(message);
});
service.on("error", (error: unknown) => {
  state.lastError = errorMessage(error);
});

async function handleIncomingMessage(message: IncomingWhatsAppMessage) {
  const imageCommandText = message.media?.caption ?? message.text;
  const requestedImageSave =
    message.media?.kind === "image" && /^\/add\b/i.test(imageCommandText?.trim() ?? "");
  const validImageCommand = parseAddImageCommand(imageCommandText);
  const item: TestMessage = {
    id: message.id,
    senderJid: message.senderNumber,
    receivedAt: message.receivedAt.toISOString(),
    text: message.text,
    media: message.media
      ? {
          kind: message.media.kind,
          mimeType: message.media.mimeType,
          fileName: message.media.fileName,
        }
      : undefined,
  };
  if (requestedImageSave) {
    item.imageSave = validImageCommand
      ? { status: "saving" }
      : { status: "failed", error: "Use /add followed by a safe folder name, for example /add be-213." };
  }
  if (message.media) mediaDownloads.set(message.id, message.media);
  state.messages = [item, ...state.messages.filter((existing) => existing.id !== item.id)].slice(
    0,
    maxMessages,
  );
  const retained = new Set(state.messages.map((existing) => existing.id));
  for (const id of mediaDownloads.keys()) {
    if (!retained.has(id)) mediaDownloads.delete(id);
  }

  try {
    const saved = await saveAddImageCommand(message, getWhatsAppImageInboxPath());
    if (!saved) return;
    updateMessage(message.id, {
      status: "saved",
      folder: saved.folder,
      fileName: saved.fileName,
      absolutePath: saved.absolutePath,
    });
  } catch (error) {
    updateMessage(message.id, { status: "failed", error: errorMessage(error) });
  }
}

function updateMessage(id: string, imageSave: NonNullable<TestMessage["imageSave"]>) {
  state.messages = state.messages.map((message) =>
    message.id === id ? { ...message, imageSave } : message,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected WhatsApp test error.";
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function assertAuthorized(request: IncomingMessage) {
  if (request.headers["x-whatsapp-test-token"] !== token) {
    throw new HttpError(403, "Invalid local test token.");
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new HttpError(413, "Test payload exceeds 20 MB.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
}

function decodeFile(value: unknown) {
  const encoded = requiredString(value, "File data");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new HttpError(400, "The selected file is empty.");
  if (buffer.length > 15 * 1024 * 1024) throw new HttpError(413, "Files are limited to 15 MB in this test console.");
  return buffer;
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL) {
  assertAuthorized(request);

  if (request.method === "GET" && url.pathname === "/api/status") {
    return json(response, 200, state);
  }

  if (request.method === "POST" && url.pathname === "/api/connection") {
    const body = await readJson(request);
    const action = requiredString(body.action, "Action");
    state.lastError = null;
    if (action === "start") {
      await service.start();
    } else if (action === "refresh") {
      await service.stop();
      state.qrDataUrl = null;
      state.qrUpdatedAt = null;
      await service.start();
    } else if (action === "logout") {
      await service.logout();
      state.connectedJid = null;
      state.messages = [];
      mediaDownloads.clear();
    } else {
      throw new HttpError(400, "Unsupported connection action.");
    }
    return json(response, 200, state);
  }

  if (request.method === "POST" && url.pathname === "/api/send") {
    const body = await readJson(request);
    const type = requiredString(body.type, "Message type");
    const number = requiredString(body.number, "Customer number");
    if (type === "text") {
      const sent = await service.sendText(number, requiredString(body.text, "Message"));
      return json(response, 200, sent);
    }
    if (type === "image") {
      const sent = await service.sendImage(number, {
        image: decodeFile(body.dataBase64),
        caption: typeof body.caption === "string" ? body.caption : undefined,
        mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
      });
      return json(response, 200, sent);
    }
    if (type === "document") {
      const sent = await service.sendDocument(number, {
        document: decodeFile(body.dataBase64),
        caption: typeof body.caption === "string" ? body.caption : undefined,
        mimeType: requiredString(body.mimeType, "Document MIME type"),
        fileName: requiredString(body.fileName, "Document filename"),
      });
      return json(response, 200, sent);
    }
    throw new HttpError(400, "Unsupported message type.");
  }

  if (request.method === "GET" && url.pathname === "/api/media") {
    const id = requiredString(url.searchParams.get("id"), "Message ID");
    const media = mediaDownloads.get(id);
    if (!media) throw new HttpError(404, "Incoming media is no longer available in this test session.");
    const buffer = await media.download();
    const fileName = (media.fileName ?? `${id}.${media.kind === "image" ? "jpg" : "bin"}`)
      .replace(/[\r\n"\\/]/g, "_");
    response.writeHead(200, {
      "content-type": media.mimeType ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-length": buffer.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    return response.end(buffer);
  }

  throw new HttpError(404, "Test endpoint not found.");
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      });
      return response.end(renderPage(token));
    }
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    throw new HttpError(404, "Page not found.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : errorMessage(error);
    state.lastError = status >= 500 ? message : state.lastError;
    json(response, status, { error: message });
  }
});

async function shutdown() {
  await service.close();
  server.close(() => process.exit(0));
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

server.listen(port, host, () => {
  console.log(`VibeRent WhatsApp standalone test console: http://${host}:${port}`);
});

function renderPage(testToken: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp Service Test</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#19191f;font:14px/1.45 Inter,system-ui,sans-serif}.shell{width:min(1100px,calc(100% - 32px));margin:32px auto}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.eyebrow{margin:0;color:#006fe6;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}h1{margin:4px 0 2px;font-size:28px}h2{margin:0;font-size:16px}.muted{color:#667085}.status{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid #d0d5dd;border-radius:999px;background:#fff;font-weight:700}.dot{width:8px;height:8px;border-radius:50%;background:#98a2b3}.connected .dot{background:#12b76a}.connecting .dot{background:#f79009}.error{margin-bottom:16px;padding:12px;border:1px solid #fecdca;border-radius:10px;background:#fef3f2;color:#b42318}.grid{display:grid;grid-template-columns:380px 1fr;gap:18px}.card{border:1px solid #e4e7ec;border-radius:12px;background:#fff;box-shadow:0 1px 2px #1018280d}.card-head{padding:16px 18px;border-bottom:1px solid #eaecf0}.card-body{padding:18px}.qr{min-height:330px;display:grid;place-items:center;border:1px dashed #d0d5dd;border-radius:12px;background:#fafcff;text-align:center;padding:20px}.qr img{width:min(100%,300px);border-radius:8px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}button{min-height:42px;border:0;border-radius:9px;padding:0 15px;background:#006fe6;color:#fff;font:inherit;font-weight:750;cursor:pointer}button.secondary{border:1px solid #d0d5dd;background:#fff;color:#344054}button.danger{border:1px solid #fda29b;background:#fff;color:#b42318}button:disabled{cursor:not-allowed;opacity:.55}label{display:block;margin:13px 0 0;font-weight:700}input,textarea,select{width:100%;min-height:42px;margin-top:6px;border:1px solid #d0d5dd;border-radius:9px;padding:9px 11px;background:#fff;color:#19191f;font:inherit}textarea{min-height:92px;resize:vertical}.send-grid{display:grid;grid-template-columns:1fr 160px;gap:12px}.messages{max-height:380px;overflow:auto}.message{padding:13px 0;border-bottom:1px solid #eaecf0}.message:last-child{border:0}.message-top{display:flex;justify-content:space-between;gap:12px;font-size:12px}.pill{padding:2px 7px;border-radius:999px;background:#eff8ff;color:#175cd3;font-weight:700}.empty{padding:28px 12px;text-align:center;color:#667085}.notice{margin-top:12px;padding:10px;border-radius:8px;background:#ecfdf3;color:#067647}.hidden{display:none}@media(max-width:800px){.shell{width:min(100% - 20px,620px);margin:18px auto}.head{display:block}.status{margin-top:12px}.grid{grid-template-columns:1fr}.send-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="head"><div><p class="eyebrow">Standalone test system</p><h1>WhatsApp connection</h1><p class="muted">This console is isolated from VibeRent customer and booking flows.</p></div><div id="status" class="status"><span class="dot"></span><span>Idle</span></div></header>
    <div id="error" class="error hidden" role="alert"></div>
    <div class="grid">
      <section class="card"><div class="card-head"><h2>Pair this installation</h2><div class="muted">Open WhatsApp → Linked devices → Link a device.</div></div><div class="card-body"><div id="qr" class="qr"><div><strong>No active QR code</strong><p class="muted">Select Start connection to generate one.</p></div></div><div class="actions"><button id="start">Start connection</button><button id="refresh" class="secondary">Refresh QR</button><button id="logout" class="danger">Unlink session</button></div><p id="qr-time" class="muted"></p></div></section>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Send a test message</h2><div class="muted">Pakistani customer numbers are normalized before sending.</div></div><div class="card-body"><div class="send-grid"><label>Customer number<input id="number" placeholder="03001234567" autocomplete="off"></label><label>Message type<select id="type"><option value="text">Text</option><option value="image">Image</option><option value="document">Document</option></select></label></div><label>Message / caption<textarea id="message" placeholder="Test message from VibeRent"></textarea></label><label id="file-row" class="hidden">File<input id="file" type="file"></label><div class="actions"><button id="send">Send test</button></div><div id="notice" class="notice hidden"></div></div></section>
        <section class="card" style="margin-top:18px"><div class="card-head"><h2>Incoming messages</h2><div class="muted">The latest 50 events are retained only in memory.</div></div><div id="messages" class="card-body messages"><div class="empty">No messages received in this test run.</div></div></section>
      </div>
    </div>
  </main>
  <script>
    const token=${JSON.stringify(testToken)};let busy=false;
    const el=id=>document.getElementById(id);
    async function api(url,options={}){const response=await fetch(url,{cache:'no-store',...options,headers:{'x-whatsapp-test-token':token,...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Test operation failed.');return data}
    function setBusy(value){busy=value;['start','refresh','logout','send'].forEach(id=>el(id).disabled=value)}
    function showError(message){el('error').textContent=message||'';el('error').classList.toggle('hidden',!message)}
    function showNotice(message){el('notice').textContent=message||'';el('notice').classList.toggle('hidden',!message)}
    function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
    function render(state){const status=el('status');status.className='status '+state.status;status.lastElementChild.textContent=state.status.replace('_',' ');showError(state.lastError);if(state.qrDataUrl){el('qr').innerHTML='<img alt="WhatsApp pairing QR code" src="'+state.qrDataUrl+'">';el('qr-time').textContent='QR updated '+new Date(state.qrUpdatedAt).toLocaleTimeString()+'. It refreshes automatically.'}else{el('qr').innerHTML='<div><strong>'+(state.status==='connected'?'WhatsApp connected':'No active QR code')+'</strong><p class="muted">'+(state.status==='connected'?escapeHtml(state.connectedJid||'Linked device ready.'):'Select Start connection to generate one.')+'</p></div>';el('qr-time').textContent=''}el('messages').innerHTML=state.messages.length?state.messages.map(message=>'<article class="message"><div class="message-top"><strong>'+escapeHtml(message.senderJid)+'</strong><span>'+new Date(message.receivedAt).toLocaleString()+'</span></div><p>'+escapeHtml(message.text||'(media message)')+'</p>'+(message.imageSave?'<p class="'+(message.imageSave.status==='failed'?'error':'notice')+'">'+(message.imageSave.status==='saving'?'Saving image…':message.imageSave.status==='saved'?'Saved to '+escapeHtml(message.imageSave.folder)+'/'+escapeHtml(message.imageSave.fileName):escapeHtml(message.imageSave.error))+'</p>':'')+(message.media?'<div class="actions"><span class="pill">'+escapeHtml(message.media.kind)+'</span><button class="secondary" data-media-id="'+escapeHtml(encodeURIComponent(message.id))+'">Download</button></div>':'')+'</article>').join(''):'<div class="empty">No messages received in this test run.</div>'}
    async function poll(){try{render(await api('/api/status'))}catch(error){showError(error.message)}finally{setTimeout(poll,1000)}}
    async function connection(action){setBusy(true);showError('');showNotice('');try{render(await api('/api/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})}))}catch(error){showError(error.message)}finally{setBusy(false)}}
    function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read the selected file.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file)})}
    async function send(){setBusy(true);showError('');showNotice('');try{const type=el('type').value;const body={type,number:el('number').value,text:el('message').value,caption:el('message').value};if(type!=='text'){const file=el('file').files[0];if(!file)throw new Error('Select a file first.');body.dataBase64=await fileBase64(file);body.mimeType=file.type||'application/octet-stream';body.fileName=file.name}const result=await api('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});showNotice('Sent message '+result.id+'.')}catch(error){showError(error.message)}finally{setBusy(false)}}
    async function downloadMedia(id){try{const response=await fetch('/api/media?id='+id,{headers:{'x-whatsapp-test-token':token}});if(!response.ok){const data=await response.json();throw new Error(data.error)}const blob=await response.blob();const disposition=response.headers.get('content-disposition')||'';const match=disposition.match(/filename="([^"]+)"/);const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=match?.[1]||'received-media';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}catch(error){showError(error.message)}}
    el('start').onclick=()=>connection('start');el('refresh').onclick=()=>connection('refresh');el('logout').onclick=()=>{if(confirm('Unlink this WhatsApp session and clear its saved credentials?'))connection('logout')};el('send').onclick=send;el('type').onchange=()=>el('file-row').classList.toggle('hidden',el('type').value==='text');el('messages').onclick=event=>{const button=event.target.closest('[data-media-id]');if(button)downloadMedia(button.dataset.mediaId)};poll();
  </script>
</body>
</html>`;
}
