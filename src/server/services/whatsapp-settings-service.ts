import "server-only";

import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";
import { getWhatsAppRuntimeSnapshot, logoutWhatsAppRuntime, startWhatsAppRuntime } from "@/server/whatsapp/runtime-registry";

type SettingsRow={sessionId:string;ownerNumber:string|null;listeningEnabled:number};
export type WhatsAppSettingsDto={ownerNumber:string;listeningEnabled:boolean;sessionId:string;runtime:ReturnType<typeof getWhatsAppRuntimeSnapshot>};

function requireOwner(context:RequestContext){requireRole(context,["agency_owner"]);}
function sessionId(agencyId:string){return `agency-${agencyId.replace(/[^a-z0-9_-]/gi,"_").slice(0,80)}`;}
function readRow(agencyId:string){return sqlite.prepare("SELECT session_id AS sessionId,owner_phone_normalized AS ownerNumber,listening_enabled AS listeningEnabled FROM whatsapp_settings WHERE agency_id=? LIMIT 1").get(agencyId) as SettingsRow|undefined;}

export function getWhatsAppSettings(context:RequestContext):WhatsAppSettingsDto {
  requireOwner(context);
  const row=readRow(context.agencyId);
  const id=row?.sessionId??sessionId(context.agencyId);
  return {ownerNumber:row?.ownerNumber??"",listeningEnabled:Boolean(row?.listeningEnabled),sessionId:id,runtime:getWhatsAppRuntimeSnapshot(context.agencyId)};
}

export function saveWhatsAppSettings(context:RequestContext,input:{ownerNumber:string;listeningEnabled:boolean}) {
  requireOwner(context);
  let ownerNumber="";
  try { ownerNumber=input.ownerNumber.trim()?normalizePakistanPhone(input.ownerNumber):""; }
  catch { throw new DomainError("VALIDATION_FAILED","Enter a valid Pakistani mobile number.",400,{ownerNumber:"Use a number such as 0300 1234567."}); }
  if(input.listeningEnabled&&!ownerNumber) throw new DomainError("VALIDATION_FAILED","Set the owner WhatsApp number before enabling commands.",400,{ownerNumber:"Owner number is required."});
  const id=sessionId(context.agencyId);const now=new Date().toISOString();
  sqlite.transaction(()=>{
    sqlite.prepare(`INSERT INTO whatsapp_settings (agency_id,session_id,owner_phone_normalized,listening_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(agency_id) DO UPDATE SET owner_phone_normalized=excluded.owner_phone_normalized,listening_enabled=excluded.listening_enabled,updated_at=excluded.updated_at`)
      .run(context.agencyId,id,ownerNumber||null,input.listeningEnabled?1:0,now,now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?)`)
      .run(context.agencyId,context.userId,"whatsapp.settings_updated","agency",context.agencyId,JSON.stringify({listeningEnabled:input.listeningEnabled,ownerNumberConfigured:Boolean(ownerNumber)}),now);
  })();
  const runtime=getWhatsAppRuntimeSnapshot(context.agencyId);
  if(runtime.status!=="idle") void startWhatsAppRuntime({agencyId:context.agencyId,sessionId:id,ownerNumber:ownerNumber||null,listeningEnabled:input.listeningEnabled});
  return getWhatsAppSettings(context);
}

export async function connectWhatsApp(context:RequestContext){requireOwner(context);const settings=getWhatsAppSettings(context);return startWhatsAppRuntime({agencyId:context.agencyId,sessionId:settings.sessionId,ownerNumber:settings.ownerNumber||null,listeningEnabled:settings.listeningEnabled});}
export async function disconnectWhatsApp(context:RequestContext){requireOwner(context);await logoutWhatsAppRuntime(context.agencyId);return getWhatsAppSettings(context);}

export async function startConfiguredWhatsAppRuntimes(){
  const rows=sqlite.prepare("SELECT agency_id AS agencyId,session_id AS sessionId,owner_phone_normalized AS ownerNumber,listening_enabled AS listeningEnabled FROM whatsapp_settings WHERE listening_enabled=1 AND owner_phone_normalized IS NOT NULL").all() as Array<{agencyId:string;sessionId:string;ownerNumber:string;listeningEnabled:number}>;
  for(const row of rows){try{await startWhatsAppRuntime({agencyId:row.agencyId,sessionId:row.sessionId,ownerNumber:row.ownerNumber,listeningEnabled:Boolean(row.listeningEnabled)})}catch(error){console.error(JSON.stringify({event:"whatsapp.start_failed",agencyId:row.agencyId,error:error instanceof Error?error.message:"unknown"}))}}
}
