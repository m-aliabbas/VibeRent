export type CnicExtractedValues = {
  name: string | null;
  father_name: string | null;
  dob: string | null;
  address: string | null;
  expiry: string | null;
  cnic_no: string | null;
};

export type CnicIntakeFile = {
  id: string;
  side: "front" | "back";
  originalName: string;
  mimeType: string;
  size: number;
  ocrStatus: "complete" | "failed" | "not_configured" | "waiting_for_pair";
  createdAt: string;
  previewUrl: string;
};

export type CnicIntake = {
  bookingDraftId: string;
  front: CnicIntakeFile | null;
  back: CnicIntakeFile | null;
  extracted: CnicExtractedValues;
};

export function cnicExtractionKey(extracted: CnicExtractedValues) {
  return JSON.stringify(extracted);
}

export function ocrDate(value: string | null) {
  if (!value) return "";
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

type OcrEditableCustomer = {
  name: string;
  fatherName?: string;
  cnic: string;
  dateOfBirth?: string;
  address?: string;
  cnicExpiresAt?: string;
};

export function mergeCnicExtraction<T extends OcrEditableCustomer>(
  current: T,
  extracted: CnicExtractedValues,
  previous?: CnicExtractedValues,
): T {
  const next = {
    name: extracted.name ?? "",
    fatherName: extracted.father_name ?? "",
    cnic: extracted.cnic_no ?? "",
    dateOfBirth: ocrDate(extracted.dob),
    address: extracted.address ?? "",
    cnicExpiresAt: ocrDate(extracted.expiry),
  };
  const prior = previous ? {
    name: previous.name ?? "",
    fatherName: previous.father_name ?? "",
    cnic: previous.cnic_no ?? "",
    dateOfBirth: ocrDate(previous.dob),
    address: previous.address ?? "",
    cnicExpiresAt: ocrDate(previous.expiry),
  } : undefined;
  const shouldFill = (field: keyof typeof next) => Boolean(next[field]) && (!current[field] || current[field] === prior?.[field]);
  return {
    ...current,
    name: shouldFill("name") ? next.name : current.name,
    fatherName: shouldFill("fatherName") ? next.fatherName : current.fatherName,
    cnic: shouldFill("cnic") ? next.cnic : current.cnic,
    dateOfBirth: shouldFill("dateOfBirth") ? next.dateOfBirth : current.dateOfBirth,
    address: shouldFill("address") ? next.address : current.address,
    cnicExpiresAt: shouldFill("cnicExpiresAt") ? next.cnicExpiresAt : current.cnicExpiresAt,
  };
}
