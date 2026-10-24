export type AgreementGuarantor = {
  name:string;
  parentage:string;
  cnic:string;
  phone:string;
  address:string;
  carAmount:number;
};

export function guarantorFields(guarantor:AgreementGuarantor) {
  return [
    { en: "Guarantor Name", ur: "ضامن کا نام", value: guarantor.name },
    { en: "Parentage", ur: "ولدیت", value: guarantor.parentage },
    { en: "CNIC", ur: "شناختی کارڈ", value: formatCnic(guarantor.cnic) },
    { en: "Phone", ur: "فون", value: guarantor.phone },
    { en: "Address", ur: "پتہ", value: guarantor.address },
    { en: "Amount of car", ur: "گاڑی کی رقم", value: guarantor.carAmount ? `PKR ${guarantor.carAmount.toLocaleString("en-PK")}` : "" },
  ] as const;
}

function formatCnic(value:string) {
  const digits=value.replace(/\D/g,"");
  return digits.length===13?`${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}`:value;
}
