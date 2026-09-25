import assert from "node:assert/strict";
import { computeDashboard } from "../src/lib/dashboard";
import { planReceive, planSend, type HandoverContext, type HandoverPlan } from "../src/lib/handover";
import type { Hub, Item, ItemEvent, Person } from "../src/lib/schema";

// A card's full life across hubs, run through the real planners and the dashboard calculation.
const hub = (id: string): Hub => ({ hub_id: id, name: id, city: id, is_central: id === "bangalore" ? "true" : "false", active: "true" });
const hubs = [hub("bangalore"), hub("hyderabad")];
const person = (id: string, role: Person["role"], h: string): Person => ({ person_id: id, name: id, role, hub: h, linked_user: "", active: "true" });
const people = [
  person("im-blr", "im", "bangalore"),
  person("ifo-amit", "ifo", "bangalore"),
  person("im-hyd", "im", "hyderabad"),
  person("fo-ravi", "fo", "hyderabad"),
  person("rig-s", "rig", "bangalore"),
];

let items: Item[] = [
  {
    item_id: "SD-1", item_type: "sd_card", home_hub: "bangalore", current_hub: "bangalore", status: "in_stock",
    current_holder: "", last_event_id: "", updated_at: "", attributes: "", prism_no: "", brand: "", model: "", expected_return: "",
  },
];
const events: ItemEvent[] = [];
let step = 0;
let ids = 0;

// Saves a plan the way the app does: append events, replace the item row.
const commit = (plan: HandoverPlan) => {
  assert.deepEqual(plan.errors, []);
  events.push(...plan.events);
  items = items.map((i) => plan.items.find((n) => n.item_id === i.item_id) ?? i);
};
const ctxFor = (actor: string): HandoverContext => ({
  hubs, people, actorPersonId: actor, by: `${actor}@x.com`,
  now: new Date(Date.UTC(2026, 8, 1 + ++step, 10)).toISOString(), // one day apart
  newId: (p) => `${p}-${++ids}`,
});
const now = () => new Date(Date.UTC(2026, 8, 20, 12));
const dash = (h = "") => computeDashboard(items, events, people, hubs, { hub: h, days: 30, now: now() });
const send = (actor: string, to: string) => commit(planSend(items, { recipient: to, note: "" }, ctxFor(actor)));
const receive = (actor: string, at: string) => commit(planReceive(items, { hub: at, note: "" }, ctxFor(actor)));
const where = () => `${items[0].status}@${items[0].current_hub}/${items[0].current_holder}`;

// 1. Bangalore IM hands the card to the IFO. It is traveling, still recorded at Bangalore.
send("im-blr", "ifo-amit");
assert.equal(where(), "traveling@bangalore/ifo-amit");
assert.equal(dash().byStatus.traveling, 1);

// 2. Hyderabad IM receives it from the IFO. It is now in stock AT HYDERABAD.
receive("im-hyd", "hyderabad");
assert.equal(where(), "in_stock@hyderabad/");
assert.equal(dash("hyderabad").byStatus.in_stock, 1);
assert.equal(dash("bangalore").total, 0);

// 3. Hyderabad IM gives it to their FO. It shows "with FO" AT HYDERABAD.
send("im-hyd", "fo-ravi");
assert.equal(where(), "with_fo@hyderabad/fo-ravi");
const inField = dash();
assert.equal(inField.byStatus.with_fo, 1);
assert.equal(inField.hubs.find((h) => h.hub_id === "hyderabad")!.out, 1);
assert.equal(inField.hubs.find((h) => h.hub_id === "hyderabad")!.owned, 0); // home hub is still Bangalore
assert.equal(inField.hubs.find((h) => h.hub_id === "bangalore")!.owned, 1);
assert.equal(dash("hyderabad").byStatus.with_fo, 1);
assert.equal(dash("bangalore").byStatus.with_fo, 0);
assert.equal(inField.holders[0].person_id, "fo-ravi");

// 4. FO returns it to Hyderabad IM. In stock at Hyderabad again.
receive("im-hyd", "hyderabad");
assert.equal(where(), "in_stock@hyderabad/");

// 5. Back to Bangalore with the IFO, then to the rig team, then back into Bangalore stock.
send("im-hyd", "ifo-amit");
assert.equal(where(), "traveling@hyderabad/ifo-amit"); // still Hyderabad until Bangalore receives it
receive("im-blr", "bangalore");
send("im-blr", "rig-s");
assert.equal(where(), "with_rig@bangalore/rig-s");
receive("im-blr", "bangalore");
assert.equal(where(), "in_stock@bangalore/");

// Every step was recorded, in order, and the sheet row always matches the newest event.
assert.equal(events.length, 8);
assert.equal(dash().inconsistencies.length, 0);
assert.deepEqual(events.map((e) => e.status_after), [
  "traveling", "in_stock", "with_fo", "in_stock", "traveling", "in_stock", "with_rig", "in_stock",
]);
assert.ok(events.every((e, i) => i === 0 || e.occurred_at > events[i - 1].occurred_at));

console.log("journey test passed");
