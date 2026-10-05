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

    const frontImage = formData.get("frontImage");
    const backImage = formData.get("backImage");
    if (!(frontImage instanceof File) || frontImage.size === 0 || !(backImage instanceof File) || backImage.size === 0) {
      return {
        ok: false,
        error: { code: "INVALID_IMAGE", message: "Choose both the front and back CNIC images to analyze." },
      };
    }
    if (!isSupportedMimeType(frontImage.type) || !isSupportedMimeType(backImage.type)) {
      return {
        ok: false,
        error: {
          code: "INVALID_IMAGE",
          message: "Use a JPEG, PNG, WEBP, or non-animated GIF image.",
        },
      };
    }
    if (frontImage.size > MAX_CNIC_IMAGE_BYTES || backImage.size > MAX_CNIC_IMAGE_BYTES) {
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
      front: {
        imageBytes: new Uint8Array(await frontImage.arrayBuffer()),
        mimeType: frontImage.type,
      },
      back: {
        imageBytes: new Uint8Array(await backImage.arrayBuffer()),
        mimeType: backImage.type,
      },
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
