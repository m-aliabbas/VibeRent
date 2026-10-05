import {
  CnicOcrError,
  type CnicOcrInput,
  type CnicOcrResult,
} from "./types";

export const MAX_CNIC_IMAGE_BYTES = 10 * 1024 * 1024;

export interface CnicOcrGateway {
  extract(imageDataUrl: string): Promise<string>;
}

function requiredNullableString(
  value: Record<string, unknown>,
  key: keyof CnicOcrResult,
): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "string") {
    throw new CnicOcrError(
      "INVALID_MODEL_RESPONSE",
      `OpenAI returned an invalid ${key} field.`,
    );
  }

  const trimmed = field.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseCnicOcrResult(outputText: string): CnicOcrResult {
  if (!outputText.trim()) {
    throw new CnicOcrError("EMPTY_MODEL_RESPONSE", "OpenAI returned no OCR text.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (cause) {
    throw new CnicOcrError(
      "INVALID_MODEL_RESPONSE",
      "OpenAI returned malformed OCR data.",
      { cause },
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CnicOcrError(
      "INVALID_MODEL_RESPONSE",
      "OpenAI returned an invalid OCR object.",
    );
  }

  const value = parsed as Record<string, unknown>;
  const expectedKeys = ["name", "cnic", "dob", "id_expiry"];
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in value))
  ) {
    throw new CnicOcrError(
      "INVALID_MODEL_RESPONSE",
      "OpenAI returned an unexpected OCR shape.",
    );
  }

  return {
    name: requiredNullableString(value, "name"),
    cnic: requiredNullableString(value, "cnic"),
    dob: requiredNullableString(value, "dob"),
    id_expiry: requiredNullableString(value, "id_expiry"),
  };
}

export function formatCnicOcrText(result: CnicOcrResult): string {
  return [
    `name: ${result.name ?? ""}`,
    `cnic: ${result.cnic ?? ""}`,
    `dob: ${result.dob ?? ""}`,
    `id_expiry: ${result.id_expiry ?? ""}`,
  ].join("\n");
}

export class CnicOcrService {
  constructor(private readonly gateway: CnicOcrGateway) {}

  async extract(input: CnicOcrInput): Promise<CnicOcrResult> {
    if (input.imageBytes.byteLength === 0) {
      throw new CnicOcrError("INVALID_IMAGE", "The CNIC image is empty.");
    }
    if (input.imageBytes.byteLength > MAX_CNIC_IMAGE_BYTES) {
      throw new CnicOcrError(
        "INVALID_IMAGE",
        `The CNIC image must not exceed ${MAX_CNIC_IMAGE_BYTES} bytes.`,
      );
    }

    const base64 = Buffer.from(input.imageBytes).toString("base64");
    const imageDataUrl = `data:${input.mimeType};base64,${base64}`;
    return parseCnicOcrResult(await this.gateway.extract(imageDataUrl));
  }
}
