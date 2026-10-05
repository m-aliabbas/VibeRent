import "server-only";

import OpenAI from "openai";

import {
  EncryptedCredentialError,
  loadOpenAiApiKey,
} from "@/server/desktop/encrypted-credentials";
import { CnicOcrService } from "./cnic-ocr-service";
import {
  OpenAiCnicOcrGateway,
  type OpenAiCnicOcrGatewayOptions,
} from "./openai-cnic-ocr-gateway";

export type CreateCnicOcrServiceOptions = OpenAiCnicOcrGatewayOptions & {
  apiKey?: string;
};

export async function resolveOpenAiApiKey(apiKey?: string) {
  const explicitApiKey = apiKey?.trim();
  if (explicitApiKey) return explicitApiKey;

  const environmentApiKey = process.env.OPENAI_API_KEY?.trim();
  if (environmentApiKey) return environmentApiKey;

  try {
    return await loadOpenAiApiKey();
  } catch (error) {
    if (error instanceof EncryptedCredentialError) return undefined;
    throw error;
  }
}

export function createCnicOcrService(
  options: CreateCnicOcrServiceOptions = {},
): CnicOcrService {
  const client = new OpenAI({ apiKey: options.apiKey ?? process.env.OPENAI_API_KEY });
  return new CnicOcrService(new OpenAiCnicOcrGateway(client, options));
}

export { CnicOcrService, formatCnicOcrText } from "./cnic-ocr-service";
export { CnicOcrError } from "./types";
export type {
  CnicImageMimeType,
  CnicOcrErrorCode,
  CnicOcrImage,
  CnicOcrInput,
  CnicOcrResult,
  CnicOcrStatus,
} from "./types";
