import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { queryAll } from "@/db/query";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";

/** One image to print on an agreement annexure page. `bytes` is JPEG/PNG (pdfkit-ready). */
export type AttachmentImage = { label: string; fileId: string; bytes?: Buffer };
export type AgreementAttachmentGroup = { title: string; images: AttachmentImage[] };

const storageRoot = getPrivateFileRoot();

type Source = { entityType: string; entityId: string | null; slots: Array<{ classification: string; label: string }> };

const idSlots = (prefix: string, who: string) => [
  { classification: `${prefix}_cnic_front`, label: `${who} CNIC front` },
  { classification: `${prefix}_cnic_back`, label: `${who} CNIC back` },
  { classification: `${prefix}_license_front`, label: `${who} licence front` },
  { classification: `${prefix}_license_back`, label: `${who} licence back` },
  { classification: `${prefix}_selfie`, label: `${who} photo` },
];

async function loadSource(agencyId: string, source: Source, withBytes: boolean): Promise<AttachmentImage[]> {
  if (!source.entityId) return [];
  const classes = source.slots.map(slot => slot.classification);
  const rows = await queryAll<{ id: string; classification: string; storageKey: string; createdAt: string }>(`SELECT id,classification,storage_key AS storageKey,created_at AS createdAt FROM private_files
    WHERE agency_id=? AND entity_type=? AND entity_id=? AND status='ready' AND classification IN (${classes.map(() => "?").join(",")}) ORDER BY created_at DESC`, [agencyId, source.entityType, source.entityId, ...classes]);
  const images: AttachmentImage[] = [];
  for (const slot of source.slots) {
    // Vehicle photos can repeat (up to 5); identity slots keep their latest image.
    const matches = rows.filter(row => row.classification === slot.classification);
    const picked = slot.classification === "vehicle_photo" ? matches.slice(0, 5).reverse() : matches.slice(0, 1);
    for (const [index, row] of picked.entries()) images.push({ label: slot.classification === "vehicle_photo" ? `Vehicle photo ${index + 1}` : slot.label, fileId: row.id, bytes: withBytes ? await toPdfImage(row.storageKey) : undefined });
  }
  return images.filter(image => !withBytes || image.bytes);
}

/** Reads a stored image and normalises it to a compact JPEG that pdfkit can embed (WebP/GIF/HEIC-safe). */
async function toPdfImage(storageKey: string) {
  const absolutePath = path.resolve(storageRoot, storageKey);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) return undefined;
  try {
    const bytes = await readFile(absolutePath);
    try {
      const { default: sharp } = await import("sharp");
      return await sharp(bytes, { animated: false }).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    } catch {
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      return isJpeg || isPng ? bytes : undefined;
    }
  } catch { return undefined; }
}

/**
 * Images attached to a rental agreement: page 2 holds the renter's and guarantor's CNIC, licence and selfie,
 * page 3 the vehicle photos, registration card and registered owner's CNIC.
 */
export async function loadAgreementAttachments(agencyId: string, ids: { customerId: string | null; guarantorId: string | null; vehicleId: string | null; ownerId: string | null }, options: { idDocuments: boolean; vehicleImages: boolean; withBytes: boolean }) {
  const identity: AgreementAttachmentGroup[] = [];
  const vehicle: AgreementAttachmentGroup[] = [];
  if (options.idDocuments) {
    const [renter, guarantor] = await Promise.all([
      loadSource(agencyId, { entityType: "customer", entityId: ids.customerId, slots: idSlots("customer", "Renter") }, options.withBytes),
      loadSource(agencyId, { entityType: "guarantor", entityId: ids.guarantorId, slots: idSlots("guarantor", "Guarantor") }, options.withBytes),
    ]);
    // One page: renter and guarantor documents together.
    if (renter.length || guarantor.length) identity.push({ title: guarantor.length ? "Renter and guarantor documents" : "Renter identity documents", images: [...renter, ...guarantor] });
  }
  if (options.vehicleImages && ids.vehicleId) {
    const [photos, papers, ownerCnic] = await Promise.all([
      loadSource(agencyId, { entityType: "vehicle", entityId: ids.vehicleId, slots: [{ classification: "vehicle_photo", label: "Vehicle photo" }] }, options.withBytes),
      loadSource(agencyId, { entityType: "vehicle", entityId: ids.vehicleId, slots: [
        { classification: "vehicle_registration_front", label: "Registration card front" },
        { classification: "vehicle_registration_back", label: "Registration card back" },
        { classification: "vehicle_owner_cnic_front", label: "Registered owner CNIC front" },
        { classification: "vehicle_owner_cnic_back", label: "Registered owner CNIC back" },
      ] }, options.withBytes),
      loadSource(agencyId, { entityType: "owner", entityId: ids.ownerId, slots: [{ classification: "owner_cnic_front", label: "Owner CNIC front" }, { classification: "owner_cnic_back", label: "Owner CNIC back" }] }, options.withBytes),
    ]);
    // One page: registration card and owner CNIC first, then the car photos.
    const documents = [...papers, ...(papers.some(item => item.label.startsWith("Registered owner")) ? [] : ownerCnic)];
    if (documents.length || photos.length) vehicle.push({ title: "Vehicle documents and photos", images: [...documents, ...photos].slice(0, 10) });
  }
  return { identity, vehicle };
}
