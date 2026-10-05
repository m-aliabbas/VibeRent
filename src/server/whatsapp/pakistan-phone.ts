const WHATSAPP_USER_SUFFIX = "@s.whatsapp.net";
const PAKISTAN_MOBILE_INTERNATIONAL = /^923\d{9}$/;

export class InvalidPakistanPhoneError extends Error {
  constructor() {
    super("Expected a Pakistani mobile number such as 03001234567 or +923001234567.");
    this.name = "InvalidPakistanPhoneError";
  }
}

/** Returns the canonical international digits used by WhatsApp, without a leading +. */
export function normalizePakistanPhone(input: string): string {
  let value = input.trim();

  if (value.endsWith(WHATSAPP_USER_SUFFIX)) {
    value = value.slice(0, -WHATSAPP_USER_SUFFIX.length);
  } else if (value.includes("@")) {
    throw new InvalidPakistanPhoneError();
  }

  if (!/^\+?[\d\s()-]+$/.test(value)) {
    throw new InvalidPakistanPhoneError();
  }

  let digits = value.replace(/[\s()+-]/g, "");
  if (digits.startsWith("0092")) {
    digits = digits.slice(2);
  }

  if (/^03\d{9}$/.test(digits)) {
    digits = `92${digits.slice(1)}`;
  } else if (/^3\d{9}$/.test(digits)) {
    digits = `92${digits}`;
  }

  if (!PAKISTAN_MOBILE_INTERNATIONAL.test(digits)) {
    throw new InvalidPakistanPhoneError();
  }

  return digits;
}

export function toWhatsAppJid(input: string): `${string}@s.whatsapp.net` {
  return `${normalizePakistanPhone(input)}${WHATSAPP_USER_SUFFIX}`;
}

/** Keeps only the user/number portion of a WhatsApp JID for display. */
export function whatsAppJidUser(input: string): string {
  return input.trim().split("@", 1)[0].split(":", 1)[0];
}
