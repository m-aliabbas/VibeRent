import "server-only";

import QRCode from "qrcode";
import { execute, inTransaction, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { enqueueJob } from "@/server/jobs/queue";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";
import type { WhatsAppConnectionStatus } from "@/server/whatsapp/types";

export type WhatsAppRuntimeSnapshot = {
  status: WhatsAppConnectionStatus;
  qrDataUrl: string | null;
  linkedJid: string | null;
  ownerNumber: string | null;
  listeningEnabled: boolean;
  lastError: string | null;
};
type SettingsRow={sessionId:string;ownerNumber:string|null;listeningEnabled:number};
type SessionRow={desiredState:"connected"|"disconnected";status:string;qrPayload:string|null;qrUpdatedAt:string|null;linkedJid:string|null;lastError:string|null;heartbeatAt:string|null;updatedAt:string};
export type WhatsAppSettingsDto={ownerNumber:string;listeningEnabled:boolean;sessionId:string;runtime:WhatsAppRuntimeSnapshot};

/** A gateway that stopped refreshing its heartbeat for this long is treated as offline. */
const gatewayOfflineAfterMs=60_000;
/** WhatsApp rotates pairing codes about every 20 seconds; older ones no longer scan. */
const qrFreshForMs=60_000;
const statuses:WhatsAppConnectionStatus[]=["idle","connecting","connected","disconnected","logged_out"];

function requireOwner(context:RequestContext){requireRole(context,["agency_owner"]);}
function sessionId(agencyId:string){return `agency-${agencyId.replace(/[^a-z0-9_-]/gi,"_").slice(0,80)}`;}
function readRow(agencyId:string){return queryOne<SettingsRow>("SELECT session_id AS sessionId,owner_phone_normalized AS ownerNumber,listening_enabled AS listeningEnabled FROM whatsapp_settings WHERE agency_id=? LIMIT 1",[agencyId]);}
function readSession(agencyId:string){return queryOne<SessionRow>("SELECT desired_state AS desiredState,status,qr_payload AS qrPayload,qr_updated_at AS qrUpdatedAt,linked_jid AS linkedJid,last_error AS lastError,heartbeat_at AS heartbeatAt,updated_at AS updatedAt FROM whatsapp_sessions WHERE agency_id=? LIMIT 1",[agencyId]);}

/** The connection as reported by the WhatsApp gateway, read from the database by any web replica. */
async function runtimeSnapshot(agencyId:string,settings:SettingsRow|undefined):Promise<WhatsAppRuntimeSnapshot>{
  const session=await readSession(agencyId);
  const base={ownerNumber:settings?.ownerNumber??null,listeningEnabled:Boolean(settings?.listeningEnabled)};
  if(!session)return {...base,status:"idle",qrDataUrl:null,linkedJid:null,lastError:null};
  const now=Date.now();
  const lastSeen=Date.parse(session.heartbeatAt??session.updatedAt);
  const offline=session.desiredState==="connected"&&now-lastSeen>gatewayOfflineAfterMs;
  const status=offline?"disconnected":statuses.includes(session.status as WhatsAppConnectionStatus)?session.status as WhatsAppConnectionStatus:"idle";
  const qrFresh=session.qrPayload&&session.qrUpdatedAt&&now-Date.parse(session.qrUpdatedAt)<qrFreshForMs;
  const qrDataUrl=status!=="connected"&&!offline&&qrFresh?await QRCode.toDataURL(session.qrPayload!,{width:320,margin:1}):null;
  return {...base,status,qrDataUrl,linkedJid:session.linkedJid,lastError:offline?"The WhatsApp service is offline. Messages will be sent when it reconnects.":session.lastError};
}

export async function getWhatsAppSettings(context:RequestContext):Promise<WhatsAppSettingsDto> {
  const row=await readRow(context.agencyId);
  const id=row?.sessionId??sessionId(context.agencyId);
  const canManage=context.roles.includes("agency_owner");
  const runtime=await runtimeSnapshot(context.agencyId,row);
  return {ownerNumber:canManage?row?.ownerNumber??"":"",listeningEnabled:Boolean(row?.listeningEnabled),sessionId:id,runtime:canManage?runtime:{...runtime,qrDataUrl:null,linkedJid:null,ownerNumber:null,lastError:null}};
}

/** The gateway picks up a new owner number or listening switch on its next reconcile pass (within seconds). */
export async function saveWhatsAppSettings(context:RequestContext,input:{ownerNumber:string;listeningEnabled:boolean}) {
  requireOwner(context);
  let ownerNumber="";
  try { ownerNumber=input.ownerNumber.trim()?normalizePakistanPhone(input.ownerNumber):""; }
  catch { throw new DomainError("VALIDATION_FAILED","Enter a valid Pakistani mobile number.",400,{ownerNumber:"Use a number such as 0300 1234567."}); }
  if(input.listeningEnabled&&!ownerNumber) throw new DomainError("VALIDATION_FAILED","Set the owner WhatsApp number before enabling commands.",400,{ownerNumber:"Owner number is required."});
  const id=sessionId(context.agencyId);const now=new Date().toISOString();
  await inTransaction(async ()=>{
    await execute(`INSERT INTO whatsapp_settings (agency_id,session_id,owner_phone_normalized,listening_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(agency_id) DO UPDATE SET owner_phone_normalized=excluded.owner_phone_normalized,listening_enabled=excluded.listening_enabled,updated_at=excluded.updated_at`,[context.agencyId,id,ownerNumber||null,input.listeningEnabled?1:0,now,now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?)`,[context.agencyId,context.userId,"whatsapp.settings_updated","agency",context.agencyId,JSON.stringify({listeningEnabled:input.listeningEnabled,ownerNumberConfigured:Boolean(ownerNumber)}),now]);
  },{immediate:true});
  return getWhatsAppSettings(context);
}

export async function connectWhatsApp(context:RequestContext){
  requireOwner(context);
  await requestSessionChange(context,"connected","connect");
  return (await getWhatsAppSettings(context)).runtime;
}
export async function disconnectWhatsApp(context:RequestContext){
  requireOwner(context);
  await requestSessionChange(context,"disconnected","disconnect");
  return getWhatsAppSettings(context);
}
export async function resetWhatsApp(context:RequestContext){
  requireOwner(context);
  await requestSessionChange(context,"connected","reset");
  return (await getWhatsAppSettings(context)).runtime;
}

/** Records what the owner asked for and wakes the gateway, which owns the socket. */
async function requestSessionChange(context:RequestContext,desiredState:"connected"|"disconnected",action:"connect"|"disconnect"|"reset"){
  const id=(await readRow(context.agencyId))?.sessionId??sessionId(context.agencyId);
  const now=new Date().toISOString();
  const status=desiredState==="connected"?"connecting":"idle";
  await inTransaction(async()=>{
    await execute(`INSERT INTO whatsapp_settings (agency_id,session_id,owner_phone_normalized,listening_enabled,created_at,updated_at)
      VALUES (?,?,NULL,0,?,?) ON CONFLICT(agency_id) DO NOTHING`,[context.agencyId,id,now,now]);
    await execute(`INSERT INTO whatsapp_sessions (agency_id,session_id,desired_state,status,created_at,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(agency_id) DO UPDATE SET desired_state=excluded.desired_state,status=excluded.status,last_error=NULL,qr_payload=CASE WHEN excluded.desired_state='connected' THEN whatsapp_sessions.qr_payload ELSE NULL END,heartbeat_at=NULL,updated_at=excluded.updated_at`,
      [context.agencyId,id,desiredState,status,now,now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?)`,[context.agencyId,context.userId,`whatsapp.${action}_requested`,"agency",context.agencyId,JSON.stringify({sessionId:id}),now]);
    await enqueueJob("wa.control",{agencyId:context.agencyId,action},{singletonKey:`${context.agencyId}:${action}`});
  },{immediate:true});
}
