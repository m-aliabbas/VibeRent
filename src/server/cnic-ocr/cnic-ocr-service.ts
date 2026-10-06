import {
  CnicOcrError,
  type CnicImageMimeType,
  type CnicOcrInput,
  type CnicOcrImage,
  type CnicOcrResult,
} from "./types";

export const MAX_CNIC_IMAGE_BYTES = 10 * 1024 * 1024;

export interface CnicOcrGateway {
  extract(images: { front: string; back: string; backAddressDetail?: string }): Promise<string>;
}

function sharpFormatMimeType(format: string | undefined, fallback: CnicImageMimeType): CnicImageMimeType {
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "gif") return "image/gif";
  return fallback;
}

/** CNIC cards are landscape. Normalize EXIF and sideways portrait scans before OCR. */
export async function orientCnicImageForOcr(image: CnicOcrImage): Promise<CnicOcrImage> {
  try {
    const { default: sharp } = await import("sharp");
    const source = sharp(image.imageBytes, { animated: false });
    const metadata = await source.metadata();
    let imageBytes = image.imageBytes;
    let mimeType = image.mimeType;
    let width = metadata.width ?? 0;
    let height = metadata.height ?? 0;

    if (metadata.orientation && metadata.orientation !== 1) {
      const oriented = await source.rotate().toBuffer({ resolveWithObject: true });
      imageBytes = oriented.data;
      mimeType = sharpFormatMimeType(oriented.info.format, mimeType);
      width = oriented.info.width;
      height = oriented.info.height;
    }

    if (height > width) {
      const rotated = await sharp(imageBytes, { animated: false }).rotate(270).toBuffer({ resolveWithObject: true });
      return {
        imageBytes: rotated.data,
        mimeType: sharpFormatMimeType(rotated.info.format, mimeType),
      };
    }

    return { imageBytes, mimeType };
  } catch {
    return image;
  }
}

async function createBackAddressDetail(image: CnicOcrImage): Promise<CnicOcrImage | undefined> {
  try {
    const { default: sharp } = await import("sharp");
    const metadata = await sharp(image.imageBytes, { animated: false }).metadata();
    if (!metadata.width || !metadata.height || metadata.width <= metadata.height) return undefined;
    const left = Math.floor(metadata.width * 0.14);
    const top = 0;
    const width = Math.floor(metadata.width * 0.62);
    const height = Math.floor(metadata.height * 0.62);
    const detail = await sharp(image.imageBytes, { animated: false })
      .extract({ left, top, width, height })
      .resize({ width: 2000, withoutEnlargement: false })
      .grayscale()
      .normalise({ lower: 1, upper: 99 })
      .sharpen({ sigma: 1 })
      .jpeg({ quality: 95 })
      .toBuffer();
    return { imageBytes: detail, mimeType: "image/jpeg" };
  } catch {
    return undefined;
  }
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
  const expectedKeys = ["name", "father_name", "dob", "address", "expiry", "cnic_no"];
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
    father_name: requiredNullableString(value, "father_name"),
    dob: requiredNullableString(value, "dob"),
    address: requiredNullableString(value, "address"),
    expiry: requiredNullableString(value, "expiry"),
    cnic_no: requiredNullableString(value, "cnic_no"),
  };
}

export function formatCnicOcrText(result: CnicOcrResult): string {
  return [
    `name: ${result.name ?? ""}`,
    `father_name: ${result.father_name ?? ""}`,
    `dob: ${result.dob ?? ""}`,
    `address: ${result.address ?? ""}`,
    `expiry: ${result.expiry ?? ""}`,
    `cnic_no: ${result.cnic_no ?? ""}`,
  ].join("\n");
}

export class CnicOcrService {
  constructor(private readonly gateway: CnicOcrGateway) {}

  async extract(input: CnicOcrInput): Promise<CnicOcrResult> {
    for (const [side, image] of Object.entries(input) as Array<["front" | "back", CnicOcrInput["front"]]>) {
      if (image.imageBytes.byteLength === 0) {
        throw new CnicOcrError("INVALID_IMAGE", `The CNIC ${side} image is empty.`);
      }
      if (image.imageBytes.byteLength > MAX_CNIC_IMAGE_BYTES) {
        throw new CnicOcrError(
          "INVALID_IMAGE",
          `The CNIC ${side} image must not exceed ${MAX_CNIC_IMAGE_BYTES} bytes.`,
        );
      }
    }

    const [front, back] = await Promise.all([
      orientCnicImageForOcr(input.front),
      orientCnicImageForOcr(input.back),
    ]);
    const backAddressDetail = await createBackAddressDetail(back);
    const dataUrl = (image: CnicOcrInput["front"]) =>
      `data:${image.mimeType};base64,${Buffer.from(image.imageBytes).toString("base64")}`;
    return parseCnicOcrResult(await this.gateway.extract({
      front: dataUrl(front),
      back: dataUrl(back),
      ...(backAddressDetail ? { backAddressDetail: dataUrl(backAddressDetail) } : {}),
    }));
  }
}
