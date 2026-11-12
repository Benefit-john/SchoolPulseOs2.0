import assert from "node:assert/strict";
import test from "node:test";
import { getSchoolLocalDate } from "./school-date.ts";

test("formats the calendar day in the school's timezone", () => {
  const instant = new Date("2026-11-04T00:30:00.000Z");
  assert.equal(getSchoolLocalDate(instant, "Africa/Lagos"), "2026-11-04");
  assert.equal(getSchoolLocalDate(instant, "America/Los_Angeles"), "2026-11-03");
});

test("rejects an invalid school timezone", () => {
  assert.throws(() => getSchoolLocalDate(new Date(), "Not/A_Timezone"));
});
