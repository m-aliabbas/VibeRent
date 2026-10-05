import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidPakistanPhoneError,
  normalizePakistanPhone,
  toWhatsAppJid,
  whatsAppJidUser,
} from "../src/server/whatsapp/pakistan-phone";

test("normalizes supported Pakistani mobile formats", () => {
  const inputs = [
    "03001234567",
    "3001234567",
    "+923001234567",
    "00923001234567",
    "92 300 123 4567",
    "923001234567@s.whatsapp.net",
  ];

  for (const input of inputs) {
    assert.equal(normalizePakistanPhone(input), "923001234567");
    assert.equal(toWhatsAppJid(input), "923001234567@s.whatsapp.net");
  }
});

test("keeps only the number portion of WhatsApp JIDs for display", () => {
  assert.equal(whatsAppJidUser("923025114945@s.whatsapp.net"), "923025114945");
  assert.equal(whatsAppJidUser("923025114945:12@s.whatsapp.net"), "923025114945");
});

test("rejects malformed, landline, foreign, and non-user JID values", () => {
  const invalid = [
    "030012345678",
    "0300123456",
    "02134567890",
    "+14155552671",
    "9230012345678",
    "923001234567@g.us",
    "hello",
  ];

  for (const input of invalid) {
    assert.throws(() => normalizePakistanPhone(input), InvalidPakistanPhoneError);
  }
});
