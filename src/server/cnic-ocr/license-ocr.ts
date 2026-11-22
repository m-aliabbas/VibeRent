import "server-only";

import { readFile } from "node:fs/promises";
import OpenAI from "openai";

import { MAX_CNIC_IMAGE_BYTES, normalizeCnicNumber, normalizeOcrDate, orientCnicImageForOcr } from "./cnic-ocr-service";
import { resolveOpenAiApiKey } from "./index";
import { OpenAiCnicOcrGateway } from "./openai-cnic-ocr-gateway";
import type { CnicImageMimeType, CnicOcrStatus } from "./types";

/** Fields read from a Pakistani driving licence. Dates are DD.MM.YYYY when recognised. */
export type LicenseOcrResult = {
  name: string | null;
  father_name: string | null;
  cnic_no: string | null;
  license_no: string | null;
  dob: string | null;
  issue_date: string | null;
  expiry: string | null;
  address: string | null;
  categories: string | null;
};

export const emptyLicenseResult: LicenseOcrResult = { name: null, father_name: null, cnic_no: null, license_no: null, dob: null, issue_date: null, expiry: null, address: null, categories: null };

const keys = Object.keys(emptyLicenseResult) as Array<keyof LicenseOcrResult>;

export function parseLicenseOcrResult(outputText: string): LicenseOcrResult {
  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  const result = { ...emptyLicenseResult };
  for (const key of keys) {
    const value = parsed[key];
    result[key] = typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return {
    ...result,
    cnic_no: normalizeCnicNumber(result.cnic_no),
    license_no: result.license_no ? result.license_no.replace(/\s+/g, " ").toUpperCase() : null,
    dob: normalizeOcrDate(result.dob),
    issue_date: normalizeOcrDate(result.issue_date),
    expiry: normalizeOcrDate(result.expiry),
    address: result.address ? result.address.replace(/\s*\n\s*/g, ", ").replace(/\s{2,}/g, " ") : null,
  };
}

export function parseStoredLicenseResult(value: string | null): LicenseOcrResult {
  if (!value) return { ...emptyLicenseResult };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const result = { ...emptyLicenseResult };
    for (const key of keys) result[key] = typeof parsed[key] === "string" ? parsed[key] as string : null;
    return result;
  } catch { return { ...emptyLicenseResult }; }
}

type StoredImage = { absolutePath: string; mimeType: CnicImageMimeType };

/** Reads a stored licence image pair. The front alone is enough; the back adds categories and address. */
export async function extractStoredLicense(front: StoredImage | undefined, back: StoredImage | undefined): Promise<{ status: CnicOcrStatus; result: LicenseOcrResult | null }> {
  if (!front && !back) return { status: "waiting_for_pair", result: null };
  try {
    const apiKey = await resolveOpenAiApiKey();
    if (!apiKey) return { status: "not_configured", result: null };
    const load = async (item: StoredImage) => {
      const bytes = await readFile(item.absolutePath);
      if (!bytes.byteLength || bytes.byteLength > MAX_CNIC_IMAGE_BYTES) throw new Error("Invalid licence image.");
      const oriented = await orientCnicImageForOcr({ imageBytes: bytes, mimeType: item.mimeType });
      return `data:${oriented.mimeType};base64,${Buffer.from(oriented.imageBytes).toString("base64")}`;
    };
    const primary = front ?? back!;
    const [frontUrl, backUrl] = await Promise.all([load(primary), front && back ? load(back) : Promise.resolve(undefined)]);
    const gateway = new OpenAiCnicOcrGateway(new OpenAI({ apiKey }));
    return { status: "complete", result: parseLicenseOcrResult(await gateway.extractLicense({ front: frontUrl, back: backUrl })) };
  } catch {
    return { status: "failed", result: null };
  }
}

type UploadedImage = { bytes: Uint8Array; mimeType: CnicImageMimeType };

/**
 * Reads a licence straight from uploaded images (no draft): the front alone is enough, the back adds
 * categories and address. Throws `not_configured` / `failed` as the status for the route to map.
 */
export async function extractLicenseFromUploads(front: UploadedImage | undefined, back: UploadedImage | undefined): Promise<{ status: CnicOcrStatus; result: LicenseOcrResult | null }> {
  if (!front && !back) return { status: "waiting_for_pair", result: null };
  try {
    const apiKey = await resolveOpenAiApiKey();
    if (!apiKey) return { status: "not_configured", result: null };
    const toUrl = async (item: UploadedImage) => {
      if (!item.bytes.byteLength || item.bytes.byteLength > MAX_CNIC_IMAGE_BYTES) throw new Error("Invalid licence image.");
      const oriented = await orientCnicImageForOcr({ imageBytes: item.bytes, mimeType: item.mimeType });
      return `data:${oriented.mimeType};base64,${Buffer.from(oriented.imageBytes).toString("base64")}`;
    };
    const primary = front ?? back!;
    const [frontUrl, backUrl] = await Promise.all([toUrl(primary), front && back ? toUrl(back) : Promise.resolve(undefined)]);
    const gateway = new OpenAiCnicOcrGateway(new OpenAI({ apiKey }));
    return { status: "complete", result: parseLicenseOcrResult(await gateway.extractLicense({ front: frontUrl, back: backUrl })) };
  } catch {
    return { status: "failed", result: null };
  }
}
