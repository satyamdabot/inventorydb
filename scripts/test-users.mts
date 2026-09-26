import assert from "node:assert/strict";
import { checkUserLink } from "../src/lib/user-link";
import type { Person } from "../src/lib/schema";

const person = (id: string, role: Person["role"], active = "true"): Person => ({
  person_id: id, name: id, role, hub: "bangalore", linked_user: "", active,
});
const people = [person("p-im", "im"), person("p-rig", "rig"), person("p-fo", "fo"), person("p-gone", "rig", "false")];

// IM logins link to an active IM, and only an IM.
assert.equal(checkUserLink("im", "p-im", people), "p-im");
assert.equal(checkUserLink("im", "p-rig", people), undefined);
assert.equal(checkUserLink("im", "", people), undefined);

// Rig logins link to an active rig team member, and only a rig team member.
assert.equal(checkUserLink("rig", "p-rig", people), "p-rig");
assert.equal(checkUserLink("rig", "p-im", people), undefined);
assert.equal(checkUserLink("rig", "p-fo", people), undefined);
assert.equal(checkUserLink("rig", "p-gone", people), undefined); // inactive
assert.equal(checkUserLink("rig", "", people), undefined);

// Admins may be unlinked, or linked to any active person, but never to someone who does not exist.
assert.equal(checkUserLink("admin", "", people), "");
assert.equal(checkUserLink("admin", "p-fo", people), "p-fo");
assert.equal(checkUserLink("admin", "p-nobody", people), undefined);
assert.equal(checkUserLink("admin", "p-gone", people), undefined);

console.log("users tests passed");
