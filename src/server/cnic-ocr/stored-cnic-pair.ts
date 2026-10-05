import "server-only";

import { readFile } from "node:fs/promises";

import { createCnicOcrService, resolveOpenAiApiKey } from "./index";
import type { CnicImageMimeType, CnicOcrResult, CnicOcrStatus } from "./types";

export type StoredCnicImage = {
  absolutePath: string;
  mimeType: CnicImageMimeType;
};

export type StoredCnicPairExtraction = {
  status: CnicOcrStatus;
  result: CnicOcrResult | null;
};

export async function extractStoredCnicPair(
  front: StoredCnicImage | undefined,
  back: StoredCnicImage | undefined,
): Promise<StoredCnicPairExtraction> {
  if (!front || !back) return { status: "waiting_for_pair", result: null };

  try {
    const apiKey = await resolveOpenAiApiKey();
    if (!apiKey) return { status: "not_configured", result: null };
    const [frontBytes, backBytes] = await Promise.all([
      readFile(front.absolutePath),
      readFile(back.absolutePath),
    ]);
    const result = await createCnicOcrService({ apiKey }).extract({
      front: { imageBytes: frontBytes, mimeType: front.mimeType },
      back: { imageBytes: backBytes, mimeType: back.mimeType },
    });
    return { status: "complete", result };
  } catch {
    return { status: "failed", result: null };
  }
}
