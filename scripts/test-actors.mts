import assert from "node:assert/strict";
import { actorOptions, defaultActor, resolveActor } from "../src/lib/actors";
import type { AppUser, Person } from "../src/lib/schema";

const person = (id: string, name: string, role: Person["role"], active = "true"): Person => ({
  person_id: id, name, role, hub: "bangalore", linked_user: "", active,
});
const user = (email: string, role: AppUser["role"], person_id = "", active = ""): AppUser => ({ email, role, person_id, active });

const people = [
  person("p-mihir", "Mihir", "im"),
  person("p-asha", "Asha", "im"),
  person("p-old", "Old IM", "im", "false"),
  person("p-ravi", "Ravi", "fo"),
];
const users = [
  user("Sraj@x.com", "admin"),
  user("ayadav@x.com", "admin", "p-asha"), // admin who is also the IM Asha: listed once, as a person
  user("gone@x.com", "admin", "", "false"),
  user("mihir@x.com", "im", "p-mihir"),
];

const options = actorOptions(people, users, (h) => h.toUpperCase());
assert.deepEqual(options.map((o) => o.value), ["p-asha", "p-mihir", "sraj@x.com"]);
assert.equal(options[1].label, "Mihir (IM, BANGALORE)");
assert.equal(options[2].label, "Sraj@x.com (Admin)");

// Only IMs and admins: not FOs, not inactive people, not inactive admins.
assert.ok(!options.some((o) => ["p-ravi", "p-old", "gone@x.com"].includes(o.value)));

// Default is the linked person, or the admin's email in lower case.
assert.equal(defaultActor({ personId: "p-mihir", email: "mihir@x.com" }), "p-mihir");
assert.equal(defaultActor({ personId: "", email: "Sraj@X.com" }), "sraj@x.com");

// Only listed values are accepted.
assert.equal(resolveActor("p-mihir", options), "p-mihir");
assert.equal(resolveActor("p-ravi", options), undefined);
assert.equal(resolveActor("", options), undefined);

console.log("actors tests passed");
