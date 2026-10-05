export const SUPPORTED_CNIC_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type CnicImageMimeType = (typeof SUPPORTED_CNIC_IMAGE_MIME_TYPES)[number];

export type CnicOcrInput = {
  imageBytes: Uint8Array;
  mimeType: CnicImageMimeType;
};

/** Exact OCR contract requested by the CNIC consumer. */
export type CnicOcrResult = {
  name: string | null;
  cnic: string | null;
  dob: string | null;
  id_expiry: string | null;
};

export type CnicOcrErrorCode =
  | "INVALID_IMAGE"
  | "EMPTY_MODEL_RESPONSE"
  | "INVALID_MODEL_RESPONSE";

export class CnicOcrError extends Error {
  constructor(
    public readonly code: CnicOcrErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CnicOcrError";
  }
}
