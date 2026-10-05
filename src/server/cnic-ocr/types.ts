export const SUPPORTED_CNIC_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type CnicImageMimeType = (typeof SUPPORTED_CNIC_IMAGE_MIME_TYPES)[number];

export type CnicOcrImage = {
  imageBytes: Uint8Array;
  mimeType: CnicImageMimeType;
};

export type CnicOcrInput = {
  front: CnicOcrImage;
  back: CnicOcrImage;
};

/** Exact OCR contract requested by the CNIC consumer. */
export type CnicOcrResult = {
  name: string | null;
  dob: string | null;
  address: string | null;
  expiry: string | null;
  cnic_no: string | null;
};

export type CnicOcrStatus = "complete" | "failed" | "not_configured" | "waiting_for_pair";

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
