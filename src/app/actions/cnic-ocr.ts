"use server";

import { requireRole } from "@/server/auth/authorize";
import { getWebRequestContext } from "@/server/auth/session";
import { CnicOcrError, createCnicOcrService } from "@/server/cnic-ocr";
import {
  MAX_CNIC_IMAGE_BYTES,
} from "@/server/cnic-ocr/cnic-ocr-service";
import {
  SUPPORTED_CNIC_IMAGE_MIME_TYPES,
  type CnicImageMimeType,
  type CnicOcrResult,
} from "@/server/cnic-ocr/types";

type CnicOcrActionResult =
  | { ok: true; data: CnicOcrResult }
  | { ok: false; error: { code: string; message: string } };

function isSupportedMimeType(value: string): value is CnicImageMimeType {
  return (SUPPORTED_CNIC_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export async function extractCnicAction(formData: FormData): Promise<CnicOcrActionResult> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);

    const image = formData.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return {
        ok: false,
        error: { code: "INVALID_IMAGE", message: "Choose a CNIC image to analyze." },
      };
    }
    if (!isSupportedMimeType(image.type)) {
      return {
        ok: false,
        error: {
          code: "INVALID_IMAGE",
          message: "Use a JPEG, PNG, WEBP, or non-animated GIF image.",
        },
      };
    }
    if (image.size > MAX_CNIC_IMAGE_BYTES) {
      return {
        ok: false,
        error: { code: "INVALID_IMAGE", message: "The image must be 10 MiB or smaller." },
      };
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return {
        ok: false,
        error: {
          code: "OPENAI_NOT_CONFIGURED",
          message: "Add OPENAI_API_KEY to .env.local and restart VibeRent.",
        },
      };
    }

    const service = createCnicOcrService();
    const data = await service.extract({
      imageBytes: new Uint8Array(await image.arrayBuffer()),
      mimeType: image.type,
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof CnicOcrError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return {
      ok: false,
      error: {
        code: "OCR_FAILED",
        message: "The CNIC could not be analyzed. Check the API key and try again.",
      },
    };
  }
}
