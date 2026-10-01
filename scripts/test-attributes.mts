import assert from "node:assert/strict";
import { formatAttributes, parseAttributes } from "../src/lib/attributes";

// Plain text (how the sheet is actually populated today, e.g. storage capacity).
assert.deepEqual(parseAttributes("256 GB"), "256 GB");
assert.equal(formatAttributes("256 GB"), "256 GB");

// A JSON object of key/value extras.
assert.deepEqual(parseAttributes('{"storage":"512 GB","origin":"Malaysia"}'), [
  ["storage", "512 GB"],
  ["origin", "Malaysia"],
]);
assert.equal(formatAttributes('{"storage":"512 GB","origin":"Malaysia"}'), "storage: 512 GB, origin: Malaysia");

// Blank is an empty list of entries, and an empty line in the table.
assert.deepEqual(parseAttributes(""), []);
assert.equal(formatAttributes(""), "");

// Malformed JSON falls back to the raw text rather than throwing.
assert.equal(parseAttributes("{not json"), "{not json");
assert.equal(formatAttributes("{not json"), "{not json");

// A JSON array isn't treated as key/value entries - falls back to raw text too.
assert.equal(parseAttributes("[1,2,3]"), "[1,2,3]");

console.log("attributes tests passed");
