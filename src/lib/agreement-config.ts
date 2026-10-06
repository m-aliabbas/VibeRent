export type AgreementLanguage = "en" | "ur" | "bilingual";
export type AgreementTemplate = "classic" | "modern" | "minimal";
export type AgreementDensity = "compact" | "comfortable";
export type AgreementTermsLanguage = "en" | "ur";
export type AgreementSectionId = "rental" | "renter" | "vehicle" | "charges" | "terms" | "signatures";

export type AgreementSection = {
  id: AgreementSectionId;
  enabled: boolean;
  titleEn: string;
  titleUr: string;
};

export type AgreementDesignConfig = {
  language: AgreementLanguage;
  termsLanguage: AgreementTermsLanguage;
  template: AgreementTemplate;
  accentColor: string;
  density: AgreementDensity;
  showLogo: boolean;
  showPageBorder: boolean;
  showRegistration: boolean;
  titleEn: string;
  titleUr: string;
  footerEn: string;
  footerUr: string;
  termsEn: string[];
  termsUr: string[];
  sections: AgreementSection[];
  signatures: {
    customer: boolean;
    representative: boolean;
    witness: boolean;
  };
};

export const defaultAgreementSections: AgreementSection[] = [
  { id: "rental", enabled: true, titleEn: "Rental details", titleUr: "کرایہ کی تفصیلات" },
  { id: "renter", enabled: true, titleEn: "Renter information", titleUr: "کرایہ دار کی معلومات" },
  { id: "vehicle", enabled: true, titleEn: "Vehicle information", titleUr: "گاڑی کی معلومات" },
  { id: "charges", enabled: true, titleEn: "Charges", titleUr: "کرایہ اور ادائیگی" },
  { id: "terms", enabled: true, titleEn: "Terms and conditions", titleUr: "شرائط و ضوابط" },
  { id: "signatures", enabled: true, titleEn: "Acceptance and signatures", titleUr: "منظوری اور دستخط" },
];

export const defaultTermsEn = [
  "The renter must carry a valid CNIC and driving licence throughout the rental period.",
  "The vehicle may only be used lawfully and by an authorized driver named in this agreement.",
  "The renter will return the vehicle on time, in the recorded condition, and with the agreed fuel level.",
  "Any accident, damage, theft, warning light, or mechanical issue must be reported to the agency immediately.",
  "Traffic fines, tolls, and penalties incurred during the rental period are the renter’s responsibility.",
  "The vehicle may not be sub-rented, used for racing, towing, unlawful transport, or taken outside the agreed travel area without written approval.",
  "The renter is responsible for late-return charges, missing fuel, avoidable damage, and recovery costs permitted by this agreement.",
  "The security deposit may be applied to unpaid rental charges, fines, fuel, damage, or other verified amounts, with any balance returned after reconciliation.",
  "Only the agency may approve a rental extension; keeping the vehicle beyond the agreed return time without approval is a breach of this agreement.",
  "By signing, the renter confirms that the identity, licence, vehicle-condition, rate, deposit, and contact details recorded in this agreement are correct.",
];

export const defaultTermsUr = [
  "کرایہ دار کرایہ کی پوری مدت کے دوران درست شناختی کارڈ اور ڈرائیونگ لائسنس اپنے پاس رکھے گا۔",
  "گاڑی صرف قانونی مقصد کے لیے اور اس معاہدے میں درج مجاز ڈرائیور ہی استعمال کرے گا۔",
  "کرایہ دار گاڑی مقررہ وقت پر، درج شدہ حالت اور طے شدہ ایندھن کی سطح کے ساتھ واپس کرے گا۔",
  "حادثہ، نقصان، چوری، وارننگ لائٹ یا مکینیکل خرابی کی فوری اطلاع ادارے کو دینا لازم ہے۔",
  "کرایہ کی مدت کے دوران ہونے والے ٹریفک چالان، ٹول اور جرمانے کرایہ دار کی ذمہ داری ہوں گے۔",
  "گاڑی کو تحریری اجازت کے بغیر آگے کرایہ پر دینا، ریسنگ، کھینچنے، غیر قانونی نقل و حمل یا طے شدہ سفری حدود سے باہر لے جانا منع ہے۔",
  "تاخیر سے واپسی، کم ایندھن، قابل اجتناب نقصان اور معاہدے کے مطابق ریکوری کے اخراجات کرایہ دار ادا کرے گا۔",
  "سیکیورٹی رقم بقایا کرایہ، جرمانے، ایندھن، نقصان یا دیگر تصدیق شدہ واجبات میں استعمال ہو سکتی ہے اور حساب کے بعد باقی رقم واپس کی جائے گی۔",
  "کرایہ کی مدت میں توسیع صرف ادارہ منظور کر سکتا ہے؛ اجازت کے بغیر مقررہ وقت سے زیادہ گاڑی رکھنا معاہدے کی خلاف ورزی ہے۔",
  "دستخط کے ذریعے کرایہ دار تصدیق کرتا ہے کہ شناخت، لائسنس، گاڑی کی حالت، کرایہ، ضمانت اور رابطے کی درج تفصیلات درست ہیں۔",
];

export const defaultAgreementConfig: AgreementDesignConfig = {
  language: "bilingual",
  termsLanguage: "en",
  template: "modern",
  accentColor: "#006FE6",
  density: "comfortable",
  showLogo: true,
  showPageBorder: true,
  showRegistration: true,
  titleEn: "Rental Agreement",
  titleUr: "کرایہ نامہ",
  footerEn: "Thank you for choosing our rental service.",
  footerUr: "ہماری رینٹل سروس منتخب کرنے کا شکریہ۔",
  termsEn: defaultTermsEn,
  termsUr: defaultTermsUr,
  sections: defaultAgreementSections,
  signatures: { customer: true, representative: true, witness: false },
};

const sectionIds = new Set<AgreementSectionId>(["rental", "renter", "vehicle", "charges", "terms", "signatures"]);

export function normalizeAgreementConfig(value: unknown, legacyTerms?: string | null): AgreementDesignConfig {
  const input = value && typeof value === "object" ? value as Partial<AgreementDesignConfig> : {};
  const suppliedSections = Array.isArray(input.sections) ? input.sections : [];
  const sections = suppliedSections
    .filter((item): item is AgreementSection => Boolean(item && sectionIds.has(item.id)))
    .map(item => ({
      id: item.id,
      enabled: item.enabled !== false,
      titleEn: cleanText(item.titleEn, defaultAgreementSections.find(section => section.id === item.id)?.titleEn ?? "Section", 60),
      titleUr: cleanText(item.titleUr, defaultAgreementSections.find(section => section.id === item.id)?.titleUr ?? "حصہ", 80),
    }));
  for (const section of defaultAgreementSections) {
    if (!sections.some(item => item.id === section.id)) sections.push({ ...section });
  }
  const legacyDefault = "The renter must carry a valid driving licence and CNIC, use the vehicle lawfully, return it on time with the agreed fuel level, and report any accident or damage immediately.";
  const legacyClauses = legacyTerms && legacyTerms.trim() !== legacyDefault
    ? legacyTerms.split(/\n+/).map(item => item.replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim()).filter(Boolean)
    : undefined;
  return {
    language: ["en", "ur", "bilingual"].includes(input.language ?? "") ? input.language as AgreementLanguage : defaultAgreementConfig.language,
    termsLanguage: input.termsLanguage === "ur" ? "ur" : "en",
    template: ["classic", "modern", "minimal"].includes(input.template ?? "") ? input.template as AgreementTemplate : defaultAgreementConfig.template,
    accentColor: /^#[0-9A-F]{6}$/i.test(input.accentColor ?? "") ? input.accentColor!.toUpperCase() : defaultAgreementConfig.accentColor,
    density: input.density === "compact" ? "compact" : "comfortable",
    showLogo: input.showLogo !== false,
    showPageBorder: input.showPageBorder !== false,
    showRegistration: input.showRegistration !== false,
    titleEn: cleanText(input.titleEn, defaultAgreementConfig.titleEn, 80),
    titleUr: cleanText(input.titleUr, defaultAgreementConfig.titleUr, 100),
    footerEn: cleanText(input.footerEn, defaultAgreementConfig.footerEn, 180),
    footerUr: cleanText(input.footerUr, defaultAgreementConfig.footerUr, 220),
    termsEn: cleanClauses(input.termsEn, legacyClauses?.length ? legacyClauses : defaultTermsEn),
    termsUr: cleanClauses(input.termsUr, defaultTermsUr),
    sections,
    signatures: {
      customer: input.signatures?.customer !== false,
      representative: input.signatures?.representative !== false,
      witness: input.signatures?.witness === true,
    },
  };
}

export function composeTermsSnapshot(config: AgreementDesignConfig) {
  const english = config.termsEn.map((term, index) => `${index + 1}. ${term}`).join("\n");
  const urdu = config.termsUr.map((term, index) => `${index + 1}. ${term}`).join("\n");
  return config.termsLanguage === "ur" ? urdu : english;
}

function cleanClauses(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const clauses = value.map(item => typeof item === "string" ? item.trim().slice(0, 600) : "").filter(Boolean).slice(0, 30);
  return clauses.length ? clauses : [...fallback];
}

function cleanText(value: unknown, fallback: string, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}
