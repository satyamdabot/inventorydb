import assert from "node:assert/strict";
import { planReceive, planSend, type HandoverContext } from "../src/lib/handover";
import { collectIds } from "../src/lib/scan";
import type { Hub, Item, Person } from "../src/lib/schema";

const hubs: Hub[] = ["bangalore", "kadapa"].map((id) => ({
  hub_id: id,
  name: id,
  city: id,
  is_central: id === "bangalore" ? "true" : "false",
  active: "true",
}));
const person = (id: string, role: Person["role"], hub: string, active = "true"): Person => ({
  person_id: id,
  name: id,
  role,
  hub,
  linked_user: "",
  active,
});
const people = [
  person("im-kad", "im", "kadapa"),
  person("ifo-amit", "ifo", "bangalore"),
  person("fo-ravi", "fo", "kadapa"),
  person("rig-s", "rig", "bangalore"),
  person("fo-gone", "fo", "kadapa", "false"),
];
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
const ctx: HandoverContext = {
  hubs,
  people,
  actorPersonId: "im-blr",
  by: "im@x.com",
  now: "2026-09-25T10:00:00Z",
  newId: (p) => `${p}-${++n}`,
};

// Each recipient role gives the right status and hub.
const toIm = planSend([item("A")], { recipient: "im-kad", note: "" }, ctx);
assert.deepEqual(toIm.errors, []);
assert.equal(toIm.items[0].status, "pending");
assert.equal(toIm.items[0].current_hub, "kadapa");
assert.equal(toIm.items[0].current_holder, "im-kad");

const toIfo = planSend([item("A")], { recipient: "ifo-amit", note: "" }, ctx);
assert.equal(toIfo.items[0].status, "traveling");
assert.equal(toIfo.items[0].current_hub, "bangalore"); // stays where it left from

assert.equal(planSend([item("A")], { recipient: "fo-ravi", note: "" }, ctx).items[0].status, "with_fo");
assert.equal(planSend([item("A")], { recipient: "rig-s", note: "" }, ctx).items[0].status, "with_rig");

// One event per card, one batch, actor recorded, last event linked on the item.
const batch = planSend([item("A"), item("B"), item("C")], { recipient: "fo-ravi", note: "field trip" }, ctx);
assert.equal(batch.events.length, 3);
assert.equal(new Set(batch.events.map((e) => e.batch_id)).size, 1);
assert.equal(batch.events[0].action, "check_out");
assert.equal(batch.events[0].from_person, "im-blr");
assert.equal(batch.events[0].note, "field trip");
assert.equal(batch.items[2].last_event_id, batch.events[2].event_id);

// Only in-stock cards can be sent; unknown or inactive recipients are refused. Nothing is planned.
const blocked = planSend([item("A"), item("B", { status: "traveling" }), item("C", { status: "lost" })], { recipient: "fo-ravi", note: "" }, ctx);
assert.match(blocked.errors[0], /B \(traveling\), C \(lost\)/);
assert.equal(blocked.events.length, 0);
assert.match(planSend([item("A")], { recipient: "fo-gone", note: "" }, ctx).errors[0], /Choose who/);
assert.match(planSend([item("A")], { recipient: "", note: "" }, ctx).errors[0], /Choose who/);

// Receive puts cards back in stock at the chosen hub with no holder.
const back = planReceive(
  [item("A", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }), item("B", { status: "traveling", current_holder: "ifo-amit" })],
  { hub: "kadapa", note: "", expected: 2 },
  ctx,
);
assert.deepEqual(back.errors, []);
assert.equal(back.mismatch, undefined);
assert.equal(back.items[0].status, "in_stock");
assert.equal(back.items[1].current_hub, "kadapa");
assert.equal(back.items[1].current_holder, "");
assert.equal(back.events[1].from_person, "ifo-amit");
assert.equal(back.events[0].action, "receive");

// Count mismatch is flagged in the note, not blocked.
const short = planReceive([item("A", { status: "pending", current_holder: "im-kad" })], { hub: "kadapa", note: "one missing", expected: 3 }, ctx);
assert.equal(short.mismatch, "Mismatch: expected 3, received 1.");
assert.equal(short.events[0].note, "Mismatch: expected 3, received 1. one missing");

// Cards that are not waiting to be received are refused.
assert.match(planReceive([item("A")], { hub: "kadapa", note: "" }, ctx).errors[0], /not waiting/);
assert.match(planReceive([item("A", { status: "pending" })], { hub: "mars", note: "" }, ctx).errors[0], /receiving hub/);

// Scan text: one per line, duplicates and blanks dropped, ticked ids merged.
assert.deepEqual(collectIds("SD-1\r\nSD-2\n\nSD-1\n", ["SD-3", "SD-2"]), ["SD-3", "SD-2", "SD-1"]);

console.log("handover tests passed");
