import "server-only";

import OpenAI from "openai";

import type { CnicOcrGateway } from "./cnic-ocr-service";

/**
 * Vision models tried in order. The first is the strongest model the agency key can use; later ones
 * are fallbacks for keys or regions where it is unavailable. `OPENAI_OCR_MODEL` (comma separated)
 * overrides the list.
 */
export const DEFAULT_OCR_MODELS = ["gpt-5.4", "gpt-4.1", "gpt-4o"] as const;

const nullableString = { type: ["string", "null"] } as const;

const CNIC_OCR_SCHEMA = {
  type: "object",
  properties: { name: nullableString, father_name: nullableString, dob: nullableString, address: nullableString, expiry: nullableString, cnic_no: nullableString },
  required: ["name", "father_name", "dob", "address", "expiry", "cnic_no"],
  additionalProperties: false,
} as const;

const ADDRESS_SCHEMA = {
  type: "object",
  properties: { address: nullableString },
  required: ["address"],
  additionalProperties: false,
} as const;

const LICENSE_OCR_SCHEMA = {
  type: "object",
  properties: { name: nullableString, father_name: nullableString, cnic_no: nullableString, license_no: nullableString, dob: nullableString, issue_date: nullableString, expiry: nullableString, address: nullableString, categories: nullableString },
  required: ["name", "father_name", "cnic_no", "license_no", "dob", "issue_date", "expiry", "address", "categories"],
  additionalProperties: false,
} as const;

const SHARED_RULES = [
  "Read only values visibly present on the images; never guess, infer, or complete an obscured value.",
  "Transliterate names and addresses into Latin-script English when printed in Urdu, Arabic, or another non-Latin script (for example, علی becomes Ali, لاہور becomes Lahore).",
  "Do not return a visible address as null merely because it is written in Urdu; read every visible address line, transliterate it, and join the lines with a comma.",
  "Do not translate the meaning of names or addresses. Keep house, street, mohalla, tehsil, district and city parts in their printed order.",
  "Return dates as DD.MM.YYYY. Return a Pakistani CNIC number as 12345-1234567-1 (13 digits).",
  "Return null for any requested field that cannot be read confidently.",
].join(" ");

export type OpenAiCnicOcrGatewayOptions = {
  model?: string;
};

type Content = OpenAI.Responses.ResponseInputContent;
type Schema = Record<string, unknown>;

function image(url: string): Content {
  return { type: "input_image", image_url: url, detail: "high" };
}

function text(value: string): Content {
  return { type: "input_text", text: value };
}

function isReasoningModel(model: string) {
  return /^(gpt-5|o\d)/.test(model);
}

/** The model is missing for this key/region: try the next one instead of failing the scan. */
function isModelUnavailable(error: unknown) {
  const status = (error as { status?: number })?.status;
  const code = String((error as { code?: string })?.code ?? "");
  return status === 404 || status === 403 || (status === 400 && /model|unsupported|reasoning/i.test(`${code} ${(error as Error)?.message ?? ""}`));
}

export class OpenAiCnicOcrGateway implements CnicOcrGateway {
  private readonly models: string[];

  constructor(
    private readonly client: OpenAI,
    options: OpenAiCnicOcrGatewayOptions = {},
  ) {
    const configured = process.env.OPENAI_OCR_MODEL?.split(",").map(item => item.trim()).filter(Boolean);
    this.models = options.model ? [options.model] : configured?.length ? configured : [...DEFAULT_OCR_MODELS];
  }

  private async run(name: string, instructions: string, content: Content[], schema: Schema): Promise<string> {
    let lastError: unknown;
    for (const model of this.models) {
      try {
        const response = await this.client.responses.create({
          model,
          store: false,
          instructions,
          input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name, strict: true, schema } },
          ...(isReasoningModel(model) ? { reasoning: { effort: "low" as const }, max_output_tokens: 8000 } : { max_output_tokens: 1200 }),
        });
        return response.output_text;
      } catch (error) {
        lastError = error;
        if (!isModelUnavailable(error)) throw error;
      }
    }
    throw lastError ?? new Error("No OCR model is available.");
  }

  async extract(images: { front: string; back: string; backAddressDetail?: string }): Promise<string> {
    return this.run("cnic_ocr", [
      "You are a precise OCR extractor for Pakistani CNIC (computerised national identity card) images.",
      "Use the supplied front and back images together as two sides of the same card.",
      "The front shows name, father or husband name, identity number, date of birth, date of issue and date of expiry.",
      "Inspect the back image independently and carefully; the holder's present address is printed there, usually in two Urdu lines.",
      SHARED_RULES,
    ].join(" "), [
      text("From these front and back CNIC images, return strictly these fields when visibly available: name, father_name, dob, address, expiry, and cnic_no. father_name may be printed as Father Name or Husband Name. expiry is the Date of Expiry. Use null for every unavailable field."),
      text("CNIC front:"), image(images.front),
      text("CNIC back:"), image(images.back),
      ...(images.backAddressDetail ? [text("Enlarged high-contrast crop of the address area from the same CNIC back:"), image(images.backAddressDetail)] : []),
    ], CNIC_OCR_SCHEMA);
  }

  /** Second, address-only pass used when the first pass could not read the address. */
  async extractAddress(images: { back: string; backAddressDetail?: string }): Promise<string> {
    return this.run("cnic_address", [
      "You read the holder's present address from the back of a Pakistani CNIC.",
      "The address is printed in Urdu, usually on two lines near the top, after the word پتہ (address). Ignore the barcode, the registrar signature and the card number.",
      SHARED_RULES,
    ].join(" "), [
      text("Return only the transliterated address from this CNIC back, or null if no address is visible."),
      image(images.back),
      ...(images.backAddressDetail ? [text("Enlarged crop of the address area:"), image(images.backAddressDetail)] : []),
    ], ADDRESS_SCHEMA);
  }

  async extractLicense(images: { front: string; back?: string }): Promise<string> {
    return this.run("license_ocr", [
      "You are a precise OCR extractor for Pakistani driving licence cards (Punjab, Sindh, KPK, Balochistan, Islamabad, and international driving permits).",
      "A licence usually shows the holder name, father name, CNIC number, licence number, date of birth, issue date, validity or expiry date, licence categories (for example M/CYCLE, CAR, LTV, HTV) and sometimes the address.",
      "The licence number is the licence/permit number, not the CNIC number; on some cards the licence number equals the CNIC number with a suffix, so copy it exactly as printed.",
      SHARED_RULES,
    ].join(" "), [
      text("From these driving licence images return strictly: name, father_name, cnic_no, license_no, dob, issue_date, expiry (valid to / expiry), address, and categories (comma separated). Use null for every unavailable field."),
      text("Licence front:"), image(images.front),
      ...(images.back ? [text("Licence back:"), image(images.back)] : []),
    ], LICENSE_OCR_SCHEMA);
  }
}
