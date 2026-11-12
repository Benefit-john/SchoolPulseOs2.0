import assert from "node:assert/strict";
import test from "node:test";
import { isRegistrationCodeUsable } from "./registration-code.ts";

const now = Date.parse("2026-11-04T12:00:00.000Z");
const validRecord = {
  registration_code: "AB12CD34",
  registration_code_expires_at: "2026-11-05T12:00:00.000Z",
  registration_code_used_at: null,
};

test("accepts a matching, unused, unexpired registration code", () => {
  assert.equal(isRegistrationCodeUsable(validRecord, "AB12CD34", now), true);
});

test("rejects used, expired, missing, or mismatched registration codes", () => {
  assert.equal(
    isRegistrationCodeUsable(
      { ...validRecord, registration_code_used_at: "2026-11-04T11:00:00.000Z" },
      "AB12CD34",
      now,
    ),
    false,
  );
  assert.equal(
    isRegistrationCodeUsable(
      { ...validRecord, registration_code_expires_at: "2026-11-04T11:00:00.000Z" },
      "AB12CD34",
      now,
    ),
    false,
  );
  assert.equal(isRegistrationCodeUsable(validRecord, undefined, now), false);
  assert.equal(isRegistrationCodeUsable(validRecord, "WRONG", now), false);
});
