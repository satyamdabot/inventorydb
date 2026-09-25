import assert from "node:assert/strict";
import { parseTable } from "../src/lib/csv";
import { planPeopleImport } from "../src/lib/import-people";
import type { Hub, Person } from "../src/lib/schema";

const hubs: Hub[] = [
  { hub_id: "bangalore", name: "Bangalore", city: "Bangalore", is_central: "true", active: "true" },
  { hub_id: "kadapa-2", name: "Kadapa-2", city: "Kadapa", is_central: "false", active: "true" },
  { hub_id: "salem", name: "Salem", city: "Salem", is_central: "false", active: "false" },
];
const existing: Person[] = [
  { person_id: "p-old", name: "Rahul Kumar", role: "im", hub: "bangalore", linked_user: "", active: "true" },
];
let n = 0;
const newId = () => `p-${++n}`;

// Tab-separated (pasted from Excel/Sheets), quoted field with a comma, aliases, "- IRL" suffix.
const pasted = [
  "Name\tRole\tHub\tEmail",
  "Rahul Kumar\tIM\tBangalore\t", // already exists
  "Amit Singh\tifo\tBangalore - IRL\t",
  '"Patil, Ravi"\tField Officer\tKadapa-2\tRAVI@example.com',
  "Suresh\tRig team\tBangalore\t",
  "Suresh\tRig team\tBangalore\t", // duplicate within file
].join("\r\n");
const ok = planPeopleImport(pasted, hubs, existing, newId);
assert.deepEqual(ok.errors, []);
assert.equal(ok.adds.length, 3);
assert.equal(ok.skipped.length, 2);
assert.equal(ok.adds[1].name, "Patil, Ravi");
assert.equal(ok.adds[1].role, "fo");
assert.equal(ok.adds[1].linked_user, "ravi@example.com");
assert.equal(ok.adds[0].hub, "bangalore");

// Problems are reported per row and nothing is planned as valid for them.
const bad = planPeopleImport(
  "Name,Role,Hub,Email\nAsha,manager,Nowhere,not-an-email\n,IM,Salem,",
  hubs,
  existing,
  newId,
);
assert.equal(bad.adds.length, 0);
assert.equal(bad.errors.length, 2);
assert.match(bad.errors[0], /Row 2.*role.*hub.*email/);
assert.match(bad.errors[1], /Row 3.*name is empty.*inactive/);

// Missing header columns.
assert.match(planPeopleImport("Foo,Bar\n1,2", hubs, existing, newId).errors[0], /Missing column/);
assert.equal(parseTable("a,b\n\n\nc,d\n").length, 2);

console.log("import-people tests passed");
