export const DEFAULT_LICENSE_TERM_DAYS = 30;

export type LicenseDocument = {
  approved?: unknown;
  disabled?: unknown;
  expireDate?: unknown;
  expire_date?: unknown;
};

type FirestoreTimestamp = { toDate(): Date };

export function parseLicenseExpiry(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as FirestoreTimestamp).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function defaultLicenseExpiry(now = new Date()) {
  return new Date(now.getTime() + DEFAULT_LICENSE_TERM_DAYS * 24 * 60 * 60 * 1000);
}

export function resolveLicenseExpiry(license: LicenseDocument, now = new Date()) {
  const raw = license.expireDate ?? license.expire_date;
  if (raw === undefined || raw === null) {
    return {
      expiresAt: defaultLicenseExpiry(now),
      needsBackfill: true,
    };
  }
  const configured = parseLicenseExpiry(raw);
  return {
    expiresAt: configured ?? new Date(0),
    needsBackfill: false,
  };
}

export function evaluateLicenseDocument(license: LicenseDocument, expiresAt: Date, now = new Date()) {
  if (license.disabled === true) return "revoked" as const;
  if (license.approved !== true) return "pending" as const;
  if (expiresAt.getTime() <= now.getTime()) return "expired" as const;
  return "active" as const;
}
