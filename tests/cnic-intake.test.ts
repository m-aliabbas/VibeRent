import assert from "node:assert/strict";
import test from "node:test";

import { mergeCnicExtraction, type CnicExtractedValues } from "../src/lib/cnic-intake";

const first: CnicExtractedValues = {
  name: "Ahsan Raza",
  dob: "14.03.1992",
  address: null,
  expiry: "2031-08-09",
  cnic_no: "35202-1234567-1",
};

test("automatically fills empty customer fields from CNIC OCR", () => {
  const merged = mergeCnicExtraction({ name: "", cnic: "", dateOfBirth: "", address: "", cnicExpiresAt: "", phone: "03001234567" }, first);
  assert.equal(merged.name, "Ahsan Raza");
  assert.equal(merged.cnic, "35202-1234567-1");
  assert.equal(merged.dateOfBirth, "1992-03-14");
  assert.equal(merged.cnicExpiresAt, "2031-08-09");
  assert.equal(merged.phone, "03001234567");
});

test("a later side refresh updates OCR-owned fields without replacing manual edits", () => {
  const current = { name: "Ahsan Raza", cnic: "35202-1234567-1", dateOfBirth: "1992-03-14", address: "Manually corrected address", cnicExpiresAt: "2031-08-09" };
  const next: CnicExtractedValues = { ...first, name: "Ahsan Raza Khan", address: "12 Model Town, Lahore" };
  const merged = mergeCnicExtraction(current, next, first);
  assert.equal(merged.name, "Ahsan Raza Khan");
  assert.equal(merged.address, "Manually corrected address");
});
