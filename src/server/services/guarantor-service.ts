import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";
import type { GuarantorInput } from "@/server/validation/booking";

export type GuarantorDto = GuarantorInput & {id:string};
const select = "SELECT id,name,parentage,coalesce(cnic_normalized,'') AS cnic,phone_normalized AS phone,address,car_amount AS carAmount FROM guarantors";

export function listGuarantors(context:RequestContext):GuarantorDto[] {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  return sqlite.prepare(`${select} WHERE agency_id=? AND archived_at IS NULL ORDER BY name`).all(context.agencyId) as GuarantorDto[];
}

export function saveGuarantor(context:RequestContext,raw:unknown):GuarantorDto {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  const input=raw as Partial<GuarantorDto>;
  const errors:Record<string,string>={};
  const name=input.name?.trim()??"", parentage=input.parentage?.trim()??"", address=input.address?.trim()??"", cnic=(input.cnic??"").replace(/\D/g,"");
  let phone="";try{phone=normalizePakistanPhone(input.phone??"")}catch{errors.phone="Enter a valid Pakistani mobile number."}
  if(name.length<2)errors.name="Enter the guarantor's name.";
  if(parentage.length<2)errors.parentage="Enter parentage.";
  if(cnic.length!==0&&cnic.length!==13)errors.cnic="Enter a 13-digit CNIC, or leave it blank.";
  if(address.length<5)errors.address="Enter the address.";
  if(!Number.isInteger(input.carAmount)||input.carAmount!<=0)errors.carAmount="Enter a positive whole PKR amount.";
  if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the guarantor details.",400,errors);
  const id=input.id?.trim()||`gtr_${randomUUID()}`;
  return sqlite.transaction(()=>{
    const current=sqlite.prepare("SELECT id FROM guarantors WHERE agency_id=? AND id=? AND archived_at IS NULL").get(context.agencyId,id);
    if(input.id&&!current)throw new DomainError("NOT_FOUND","Guarantor not found.",404);
    const duplicate=cnic?sqlite.prepare("SELECT id FROM guarantors WHERE agency_id=? AND cnic_normalized=? AND id<>?").get(context.agencyId,cnic,id):undefined;
    if(duplicate)throw new DomainError("VALIDATION_FAILED","A guarantor with this CNIC already exists.",409,{cnic:"CNIC must be unique."});
    const now=new Date().toISOString();
    if(current)sqlite.prepare("UPDATE guarantors SET name=?,parentage=?,cnic_normalized=?,phone_normalized=?,address=?,car_amount=?,updated_at=? WHERE agency_id=? AND id=?").run(name,parentage,cnic||null,phone,address,input.carAmount,now,context.agencyId,id);
    else sqlite.prepare("INSERT INTO guarantors (id,agency_id,name,parentage,cnic_normalized,phone_normalized,address,car_amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id,context.agencyId,name,parentage,cnic||null,phone,address,input.carAmount,now,now);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,current?"guarantor.updated":"guarantor.created","guarantor",id,JSON.stringify({name}),now);
    return sqlite.prepare(`${select} WHERE agency_id=? AND id=?`).get(context.agencyId,id) as GuarantorDto;
  })();
}

export function archiveGuarantor(context:RequestContext,id:string) {
  requireRole(context,["agency_owner","fleet_manager"]);
  const now=new Date().toISOString();
  return sqlite.transaction(()=>{
    const result=sqlite.prepare("UPDATE guarantors SET archived_at=?,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL").run(now,now,context.agencyId,id);
    if(!result.changes)throw new DomainError("NOT_FOUND","Guarantor not found.",404);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,"guarantor.archived","guarantor",id,null,now);
    return {id};
  })();
}
