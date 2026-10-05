import "server-only";

import OpenAI from "openai";

import { CnicOcrService } from "./cnic-ocr-service";
import {
  OpenAiCnicOcrGateway,
  type OpenAiCnicOcrGatewayOptions,
} from "./openai-cnic-ocr-gateway";

export type CreateCnicOcrServiceOptions = OpenAiCnicOcrGatewayOptions & {
  apiKey?: string;
};

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
