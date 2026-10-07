import assert from "node:assert/strict";
import test from "node:test";

import { parseConfirmBookingInput } from "../src/server/validation/booking";

const base = {
  vehicleId:"veh_1",customerId:"cus_1",rentalMode:"self_drive" as const,destinationCity:"Lahore",
  pickupAt:"2026-10-08T10:00:00.000Z",returnAt:"2026-10-09T10:00:00.000Z",
  extras:0,discount:0,depositRequired:0,source:"counter",estimatedKm:0,
};

test("normalizes a complete guarantor snapshot",()=>{
  const parsed=parseConfirmBookingInput({...base,guarantor:{name:" Bilal Ahmed ",parentage:" Ahmed Raza ",cnic:"35202-1234567-9",phone:"0300-1234567",address:" Model Town, Lahore ",carAmount:6500000}});
  assert.deepEqual(parsed.guarantor,{name:"Bilal Ahmed",parentage:"Ahmed Raza",cnic:"3520212345679",phone:"03001234567",address:"Model Town, Lahore",carAmount:6500000});
});

test("rejects a partially completed guarantor",()=>{
  assert.throws(()=>parseConfirmBookingInput({...base,guarantor:{name:"Bilal Ahmed",parentage:"",cnic:"35202",phone:"",address:"",carAmount:0}}),error=>{
    assert.equal((error as {code?:string}).code,"VALIDATION_FAILED");
    return true;
  });
});
