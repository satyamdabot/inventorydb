import assert from "node:assert/strict";
import { planCorrection, type CorrectionInput } from "../src/lib/correction";
import type { Hub, Item, Person } from "../src/lib/schema";

const hubs: Hub[] = ["bangalore", "kadapa"].map((id) => ({
  hub_id: id,
  name: id,
  city: id,
  is_central: id === "bangalore" ? "true" : "false",
  active: "true",
}));
const person = (id: string, role: Person["role"], hub: string): Person => ({
  person_id: id,
  name: id,
  role,
  hub,
  linked_user: "",
  active: "true",
});
const people = [person("fo-ravi", "fo", "kadapa"), person("ifo-amit", "ifo", "bangalore"), person("rig-s", "rig", "bangalore")];
const item = (id: string, over: Partial<Item> = {}): Item => ({
  item_id: id,
  item_type: "sd_card",
  home_hub: "bangalore",
  current_hub: "bangalore",
  status: "in_stock",
  current_holder: "",
  last_event_id: "",
  updated_at: "",
  attributes: "",
  prism_no: "",
  brand: "",
  model: "",
  ...over,
});
let n = 0;
const ctx = { hubs, people, by: "admin@x.com", now: "2026-09-25T10:00:00Z", newId: (p: string) => `${p}-${++n}` };
const input = (over: Partial<CorrectionInput> = {}): CorrectionInput => ({
  status: "with_fo",
  hub: "",
  holder: "fo-ravi",
  homeHub: "",
  note: "found with FO in field",
  ...over,
});

// Several cards moved to an FO: hub defaults to the FO's hub, one event per card, one batch.
const many = planCorrection([item("A"), item("B")], input(), ctx);
assert.deepEqual(many.errors, []);
assert.equal(many.events.length, 2);
assert.equal(new Set(many.events.map((e) => e.batch_id)).size, 1);
assert.equal(many.items[0].status, "with_fo");
assert.equal(many.items[0].current_hub, "kadapa");
assert.equal(many.items[0].current_holder, "fo-ravi");
assert.equal(many.items[0].last_event_id, many.events[0].event_id);
assert.equal(many.events[0].action, "correct");
assert.equal(many.events[0].recorded_by, "admin@x.com");

// Cards already in that exact state are left alone.
const same = planCorrection([item("C", { status: "with_fo", current_hub: "kadapa", current_holder: "fo-ravi" })], input(), ctx);
assert.deepEqual(same.unchanged, ["C"]);
assert.equal(same.events.length, 0);

// Back to stock clears the holder; a hub can be forced.
const back = planCorrection(
  [item("D", { status: "with_fo", current_hub: "kadapa", current_holder: "fo-ravi" })],
  input({ status: "in_stock", holder: "fo-ravi", hub: "kadapa" }),
  ctx,
);
assert.equal(back.items[0].current_holder, "");
assert.equal(back.items[0].current_hub, "kadapa");

// Traveling keeps the hub it left from.
assert.equal(planCorrection([item("E")], input({ status: "traveling", holder: "ifo-amit" }), ctx).items[0].current_hub, "bangalore");

// Changing only the home hub writes a reassign event.
const home = planCorrection([item("F")], input({ status: "in_stock", holder: "", homeHub: "kadapa" }), ctx);
assert.equal(home.events.length, 1);
assert.equal(home.events[0].action, "reassign_home_hub");
assert.equal(home.items[0].home_hub, "kadapa");

// Home hub plus state change: two events, and the last one is the state change.
const both = planCorrection([item("G")], input({ homeHub: "kadapa" }), ctx);
assert.deepEqual(both.events.map((e) => e.action), ["reassign_home_hub", "correct"]);
assert.equal(both.items[0].last_event_id, both.events[1].event_id);

// Validation: wrong role, missing holder, short note, bad status, unknown hub. Nothing is planned.
assert.match(planCorrection([item("H")], input({ holder: "ifo-amit" }), ctx).errors[0], /needs a FO/);
assert.match(planCorrection([item("H")], input({ holder: "" }), ctx).errors[0], /Choose who holds/);
assert.match(planCorrection([item("H")], input({ note: "x" }), ctx).errors[0], /note/);
assert.match(planCorrection([item("H")], input({ status: "bogus" }), ctx).errors[0], /status/);
assert.match(planCorrection([item("H")], input({ hub: "mars" }), ctx).errors[0], /Unknown hub/);
assert.equal(planCorrection([item("H")], input({ holder: "" }), ctx).events.length, 0);

console.log("correction tests passed");
