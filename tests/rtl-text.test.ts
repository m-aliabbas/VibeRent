import assert from "node:assert/strict";
import test from "node:test";
import { wrapRtlText } from "../src/server/documents/rtl-text";

test("wraps Urdu in logical order before words are positioned from right to left",()=>{
  assert.deepEqual(wrapRtlText("کرایہ دار کی معلومات",()=>true),["کرایہ دار کی معلومات"]);
  assert.deepEqual(
    wrapRtlText("کرایہ دار کی معلومات",candidate=>candidate.split(" ").length<=2),
    ["کرایہ دار","کی معلومات"],
  );
});
