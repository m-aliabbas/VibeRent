import "server-only";

import OpenAI from "openai";
import { resolveOpenAiApiKey } from "@/server/cnic-ocr";
import { SUPPORTED_CNIC_IMAGE_MIME_TYPES } from "@/server/cnic-ocr/types";
import { DomainError } from "@/server/domain/errors";

const MAX_ODOMETER_IMAGE_BYTES = 10 * 1024 * 1024;

const ODOMETER_SCHEMA = {
  type: "object",
  properties: { odometer: { type: ["integer", "null"] } },
  required: ["odometer"],
  additionalProperties: false,
} as const;

/** Reads the total distance (km) from a photo of a vehicle's instrument cluster. */
export async function readOdometerPhoto(image: File): Promise<{ odometer: number | null }> {
  if (!(SUPPORTED_CNIC_IMAGE_MIME_TYPES as readonly string[]).includes(image.type)) {
    throw new DomainError("VALIDATION_FAILED", "Use a JPEG, PNG or WEBP photo.", 400, { image: "Use a JPEG, PNG or WEBP photo." });
  }
  if (image.size > MAX_ODOMETER_IMAGE_BYTES) {
    throw new DomainError("VALIDATION_FAILED", "The photo must be 10 MiB or smaller.", 400, { image: "The photo must be 10 MiB or smaller." });
  }
  const apiKey = await resolveOpenAiApiKey();
  if (!apiKey) throw new DomainError("INTERNAL_ERROR", "OpenAI OCR is not configured for this VibeRent installation.", 503);
  const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  try {
    const response = await new OpenAI({ apiKey }).responses.create({
      model: "gpt-4o-mini",
      store: false,
      instructions: [
        "You read vehicle odometers from dashboard photos.",
        "Return the total odometer (ODO) distance as a whole number of kilometres or miles exactly as displayed, without separators.",
        "Ignore trip meters (TRIP A/B), clock, fuel range, speed and temperature.",
        "Return null when the total odometer is not clearly readable. Never guess digits.",
      ].join(" "),
      input: [{ role: "user", content: [
        { type: "input_text", text: "Read the total odometer reading from this photo." },
        { type: "input_image", image_url: dataUrl, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: "odometer_reading", strict: true, schema: ODOMETER_SCHEMA } },
      max_output_tokens: 100,
    });
    const parsed = JSON.parse(response.output_text) as { odometer: unknown };
    const value = parsed.odometer;
    return { odometer: typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null };
  } catch (error) {
    console.error(JSON.stringify({ event: "odometer.ocr_failed", message: error instanceof Error ? error.message : "unknown" }));
    throw new DomainError("INTERNAL_ERROR", "The odometer could not be read. Enter it manually.", 502);
  }
}
