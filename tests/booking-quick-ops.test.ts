import assert from "node:assert/strict";
import test from "node:test";

import { NOT_RECORDED_FUEL, parseConfirmBookingInput } from "../src/server/validation/booking";
import { parseCheckInRentalInput, parseRentalInspectionInput } from "../src/server/validation/rental-operation";

const base = {
  vehicleId:"veh_1",customerId:"cus_1",rentalMode:"self_drive" as const,
  pickupAt:"2026-10-08T16:00:00.000Z",returnAt:"2026-10-09T16:00:00.000Z",
};

test("security deposit, extras and discount are optional and default to 0",()=>{
  const parsed=parseConfirmBookingInput(base);
  assert.equal(parsed.depositRequired,0);
  assert.equal(parsed.extras,0);
  assert.equal(parsed.discount,0);
});

test("a negative deposit is still rejected",()=>{
  assert.throws(()=>parseConfirmBookingInput({...base,depositRequired:-1}));
});

test("start-now handover needs only the odometer",()=>{
  const parsed=parseConfirmBookingInput({...base,startImmediately:true,checkoutInspection:{odometer:45210}});
  assert.deepEqual(parsed.checkoutInspection,{odometer:45210,fuelLevel:NOT_RECORDED_FUEL,conditionNotes:""});
  assert.throws(()=>parseConfirmBookingInput({...base,startImmediately:true,checkoutInspection:{}}));
});

test("checkout and check-in need only the odometer",()=>{
  assert.deepEqual(parseRentalInspectionInput({odometer:100,version:2}),{odometer:100,fuelLevel:NOT_RECORDED_FUEL,conditionNotes:"",version:2});
  assert.equal(parseRentalInspectionInput({odometer:100,fuelLevel:"Half",conditionNotes:" Clean "}).conditionNotes,"Clean");
  assert.equal(parseCheckInRentalInput({odometer:200}).payment,undefined);
  assert.throws(()=>parseRentalInspectionInput({fuelLevel:"Full"}));
});
