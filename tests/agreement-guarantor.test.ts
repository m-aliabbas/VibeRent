import assert from "node:assert/strict";
import test from "node:test";
import { guarantorFields } from "../src/lib/agreement-guarantor";

test("rental agreements render the booking guarantor snapshot", () => {
  const fields=guarantorFields({name:"Bilal Ahmed",parentage:"Ahmed Raza",cnic:"3520212345679",phone:"03001234567",address:"Model Town, Lahore",carAmount:6500000});
  assert.deepEqual(fields.map(field => field.en), [
    "Guarantor Name",
    "Parentage",
    "CNIC",
    "Phone",
    "Address",
    "Amount of car",
  ]);
  assert.deepEqual(fields.map(field=>field.value),["Bilal Ahmed","Ahmed Raza","35202-1234567-9","03001234567","Model Town, Lahore","PKR 6,500,000"]);
});
