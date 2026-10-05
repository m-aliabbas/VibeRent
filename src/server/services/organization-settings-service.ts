import "server-only";

import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { composeTermsSnapshot, normalizeAgreementConfig, type AgreementDesignConfig } from "@/lib/agreement-config";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export type OrganizationSettingsDto = {
  profile: {
    name: string;
    phone: string;
    publicEmail: string;
    address: string;
    registrationNumber: string;
    taxNumber: string;
    currency: "PKR";
    timezone: "Asia/Karachi";
    logoDataUrl?: string;
  };
  agreement: AgreementDesignConfig;
};

type SettingsRow = {
  name: string;
  phone: string | null;
  publicEmail: string | null;
  address: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  currency: string;
  timezone: string;
  logoDataUrl: string | null;
  agreementConfig: unknown;
  rentalTerms: string;
};

export function getOrganizationSettings(context: RequestContext): OrganizationSettingsDto {
  const row = sqlite.prepare(`
    SELECT a.name, a.phone, a.public_email AS publicEmail, a.address,
      a.registration_number AS registrationNumber, a.tax_number AS taxNumber,
      a.currency, a.timezone, a.agreement_config AS agreementConfig,
      a.rental_terms AS rentalTerms, o.logo AS logoDataUrl
    FROM agencies a
    LEFT JOIN organization o ON o.id=a.id
    WHERE a.id=? LIMIT 1
  `).get(context.agencyId) as SettingsRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Agency settings were not found.", 404);
  return {
    profile: {
      name: row.name,
      phone: row.phone ?? "",
      publicEmail: row.publicEmail ?? "",
      address: row.address ?? "",
      registrationNumber: row.registrationNumber ?? "",
      taxNumber: row.taxNumber ?? "",
      currency: "PKR",
      timezone: "Asia/Karachi",
      logoDataUrl: row.logoDataUrl ?? undefined,
    },
    agreement: normalizeAgreementConfig(parseJson(row.agreementConfig), row.rentalTerms),
  };
}

export function updateOrganizationProfile(context: RequestContext, rawInput: unknown): OrganizationSettingsDto["profile"] {
  requireRole(context, ["agency_owner"]);
  const input = rawInput as Partial<OrganizationSettingsDto["profile"]>;
  const value = {
    name: text(input.name, 100),
    phone: text(input.phone, 30),
    publicEmail: text(input.publicEmail, 120),
    address: text(input.address, 300),
    registrationNumber: text(input.registrationNumber, 80),
    taxNumber: text(input.taxNumber, 80),
    currency: "PKR" as const,
    timezone: "Asia/Karachi" as const,
    logoDataUrl: input.logoDataUrl,
  };
  const fieldErrors: Record<string, string> = {};
  if (value.name.length < 2) fieldErrors.name = "Enter the organization name.";
  if (value.phone && !/^\+?[0-9 ()-]{7,24}$/.test(value.phone)) fieldErrors.phone = "Enter a valid business phone number.";
  if (value.publicEmail && !/^\S+@\S+\.\S+$/.test(value.publicEmail)) fieldErrors.publicEmail = "Enter a valid public email address.";
  if (value.address.length < 5) fieldErrors.address = "Enter the organization address shown on agreements.";
  if (value.logoDataUrl && (!/^data:image\/(?:png|jpeg);base64,/.test(value.logoDataUrl) || value.logoDataUrl.length > 750_000)) fieldErrors.logoDataUrl = "Use a PNG or JPG logo smaller than 500 KB.";
  if (Object.keys(fieldErrors).length) throw new DomainError("VALIDATION_FAILED", "Check the highlighted organization details.", 400, fieldErrors);
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare(`UPDATE agencies SET name=?,phone=?,public_email=?,address=?,registration_number=?,tax_number=?,version=version+1,updated_at=? WHERE id=?`)
      .run(value.name, value.phone || null, value.publicEmail || null, value.address, value.registrationNumber || null, value.taxNumber || null, now, context.agencyId);
    sqlite.prepare("UPDATE organization SET name=?,logo=coalesce(?,logo) WHERE id=?").run(value.name, value.logoDataUrl || null, context.agencyId);
    audit(context, "agency.profile_updated", { logoUpdated: Boolean(value.logoDataUrl) });
  })();
  return value;
}

export function updateAgreementDesigner(context: RequestContext, rawInput: unknown): AgreementDesignConfig {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  const config = normalizeAgreementConfig(rawInput);
  if (config.termsEn.some(item => item.length < 8) || config.termsUr.some(item => item.length < 8)) {
    throw new DomainError("VALIDATION_FAILED", "Each agreement clause must contain at least 8 characters.", 400, { terms: "Complete or remove short clauses." });
  }
  if (!config.sections.some(section => section.enabled && section.id === "terms")) {
    throw new DomainError("VALIDATION_FAILED", "Keep the terms section enabled for rental agreements.", 400, { sections: "Terms and conditions are required." });
  }
  const legacyTerms = composeTermsSnapshot({ ...config, language: "en" });
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare(`UPDATE agencies SET agreement_header=?,agreement_locale=?,agreement_config=?,rental_terms=?,version=version+1,updated_at=? WHERE id=?`)
      .run(config.titleEn, config.language, JSON.stringify(config), legacyTerms, now, context.agencyId);
    audit(context, "agreement.design_updated", { language: config.language, template: config.template, sections: config.sections.filter(item => item.enabled).map(item => item.id) });
  })();
  return config;
}

export function updateEnglishRentalTerms(context: RequestContext, terms: string) {
  const current = getOrganizationSettings(context).agreement;
  const clauses = terms.split(/\n+/).map(item => item.replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  return updateAgreementDesigner(context, { ...current, termsEn: clauses, language: current.language });
}

export function getTermsSnapshotForBooking(context: RequestContext) {
  return composeTermsSnapshot(getOrganizationSettings(context).agreement);
}

function audit(context: RequestContext, action: string, metadata: Record<string, unknown>) {
  sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(`aud_${randomUUID()}`, context.agencyId, context.userId, action, "agency", context.agencyId, JSON.stringify(metadata), new Date().toISOString());
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return undefined; }
}
