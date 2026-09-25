import assert from "node:assert/strict";
import { formatIst, istDate, istTimestamp, toIst } from "../src/lib/time";

// The timestamp you saw in the sheet, 13:44:54 UTC, is 19:14:54 in India.
assert.equal(istTimestamp(new Date("2026-09-25T13:44:54.338Z")), "2026-09-25T19:14:54+05:30");

// It is the same instant, so parsing it back gives the original time (to the second).
const original = new Date("2026-09-25T13:44:54Z");
assert.equal(Date.parse(istTimestamp(original)), original.getTime());

// The IST date rolls over at 18:30 UTC, which is midnight in India.
assert.equal(istDate(new Date("2026-09-25T18:29:59Z")), "2026-09-25");
assert.equal(istDate(new Date("2026-09-25T18:30:00Z")), "2026-09-26");
assert.equal(istTimestamp(new Date("2026-12-31T20:00:00Z")), "2027-01-01T01:30:00+05:30"); // across a year end

// Old UTC values are converted; IST values and blanks are left alone.
assert.equal(toIst("2026-09-25T13:44:54.338Z"), "2026-09-25T19:14:54+05:30");
assert.equal(toIst("2026-09-25T19:14:54+05:30"), "2026-09-25T19:14:54+05:30");
assert.equal(toIst(""), "");

// On screen: IST whether the server runs in UTC or not, and either stored format gives the same text.
assert.equal(formatIst("2026-09-25T13:44:54Z"), formatIst("2026-09-25T19:14:54+05:30"));
assert.match(formatIst("2026-09-25T13:44:54Z"), /7:14/);
assert.equal(formatIst("not a date"), "not a date");

console.log("time tests passed");
