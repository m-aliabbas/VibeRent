export type AgreementLanguage = "en" | "ur" | "bilingual";
export type AgreementTemplate = "classic" | "modern" | "minimal";
export type AgreementDensity = "compact" | "comfortable";
export type AgreementSectionId = "rental" | "renter" | "vehicle" | "charges" | "terms" | "signatures";

export type AgreementSection = {
  id: AgreementSectionId;
  enabled: boolean;
  titleEn: string;
  titleUr: string;
};

export type AgreementDesignConfig = {
  language: AgreementLanguage;
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
];

export const defaultTermsUr = [
  "کرایہ دار کرایہ کی پوری مدت کے دوران درست شناختی کارڈ اور ڈرائیونگ لائسنس اپنے پاس رکھے گا۔",
  "گاڑی صرف قانونی مقصد کے لیے اور اس معاہدے میں درج مجاز ڈرائیور ہی استعمال کرے گا۔",
  "کرایہ دار گاڑی مقررہ وقت پر، درج شدہ حالت اور طے شدہ ایندھن کی سطح کے ساتھ واپس کرے گا۔",
  "حادثہ، نقصان، چوری، وارننگ لائٹ یا مکینیکل خرابی کی فوری اطلاع ادارے کو دینا لازم ہے۔",
  "کرایہ کی مدت کے دوران ہونے والے ٹریفک چالان، ٹول اور جرمانے کرایہ دار کی ذمہ داری ہوں گے۔",
];

export const defaultAgreementConfig: AgreementDesignConfig = {
  language: "bilingual",
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
  const legacyClauses = legacyTerms?.split(/\n+/).map(item => item.replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  return {
    language: ["en", "ur", "bilingual"].includes(input.language ?? "") ? input.language as AgreementLanguage : defaultAgreementConfig.language,
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
  if (config.language === "en") return english;
  if (config.language === "ur") return urdu;
  return `Terms and conditions\n${english}\n\nشرائط و ضوابط\n${urdu}`;
}

function cleanClauses(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const clauses = value.map(item => typeof item === "string" ? item.trim().slice(0, 600) : "").filter(Boolean).slice(0, 30);
  return clauses.length ? clauses : [...fallback];
}

function cleanText(value: unknown, fallback: string, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}
