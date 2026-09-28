import assert from "node:assert/strict";
import { computeDashboard, LATE_AFTER_HOURS } from "../src/lib/dashboard";
import { planReceive, planSend, type HandoverContext, type HandoverPlan } from "../src/lib/handover";
import type { Hub, Item, ItemEvent, Person } from "../src/lib/schema";
import { istTimestamp } from "../src/lib/time";

// End to end: real sends and receives with the timestamps the app really writes (IST, +05:30), then the
// dashboard's 24-hour flags checked just before, exactly at, and just after the limit.
const hub = (id: string): Hub => ({ hub_id: id, name: id, city: id, is_central: id === "bangalore" ? "true" : "false", active: "true", parent_hub: "" });
const hubs = [hub("bangalore"), hub("hyderabad")];
const person = (id: string, role: Person["role"], h: string): Person => ({ person_id: id, name: id, role, hub: h, linked_user: "", active: "true" });
const people = [
  person("im-blr", "im", "bangalore"), person("im-hyd", "im", "hyderabad"), person("fo-ravi", "fo", "bangalore"),
  person("ifo-amit", "ifo", "bangalore"), person("rig-s", "rig", "bangalore"),
];
const card = (id: string): Item => ({
  item_id: id, item_type: "sd_card", home_hub: "bangalore", current_hub: "bangalore", status: "in_stock",
  current_holder: "", last_event_id: "", updated_at: "", attributes: "", prism_no: "", brand: "", model: "", price: "",
});

let items = ["SD-1", "SD-2", "SD-3", "SD-4", "SD-5"].map(card);
const events: ItemEvent[] = [];
let ids = 0;
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date("2026-09-26T04:30:00Z"); // 10:00 in India

const ctxAt = (t: Date, actor: string): HandoverContext => ({
  hubs, people, actorPersonId: actor, by: `${actor}@x.com`, now: istTimestamp(t), newId: (p) => `${p}-${++ids}`,
});
const commit = (plan: HandoverPlan) => {
  assert.deepEqual(plan.errors, []);
  events.push(...plan.events);
  items = items.map((i) => plan.items.find((n) => n.item_id === i.item_id) ?? i);
};
const send = (t: Date, id: string, to: string, at: string, from = "bangalore") =>
  commit(planSend(items.filter((i) => i.item_id === id), { fromHub: from, recipient: to, toHub: at, note: "" }, ctxAt(t, "im-blr")));
const receive = (t: Date, id: string, at: string) =>
  commit(planReceive(items.filter((i) => i.item_id === id), { hub: at, note: "" }, ctxAt(t, "im-hyd")));
const late = (at: Date) => computeDashboard(items, events, people, hubs, { hub: "", days: 7, now: at }).late;
const kinds = (at: Date) => late(at).map((g) => `${g.kind}:${g.key}:${g.count}`).sort();
const after = (ms: number) => new Date(T0.getTime() + ms);

// 10:00 IST: one card to an FO, one to an IFO heading to Hyderabad, one sent to Hyderabad's IM, one to the rig team.
send(T0, "SD-1", "fo-ravi", "bangalore");
send(T0, "SD-2", "ifo-amit", "hyderabad");
send(T0, "SD-3", "im-hyd", "hyderabad");
send(T0, "SD-4", "rig-s", "bangalore");

// The saved timestamp really is IST, and reads back as the same moment.
assert.equal(events[0].occurred_at, "2026-09-26T10:00:00+05:30");
assert.equal(Date.parse(events[0].occurred_at), T0.getTime());
assert.equal(LATE_AFTER_HOURS, 24);

// Just before 24 hours, and exactly 24 hours: nothing is late.
assert.deepEqual(kinds(after(1 * HOUR)), []);
assert.deepEqual(kinds(after(23 * HOUR + 59 * MIN)), []);
assert.deepEqual(kinds(after(24 * HOUR)), []); // exactly on the limit is not late
// A minute over: the FO, the IFO and the unreceived hub send are flagged. The rig team has no rule. Stock never is.
assert.deepEqual(kinds(after(24 * HOUR + MIN)), ["fo:fo-ravi:1", "ifo:ifo-amit:1", "pending:hyderabad:1"]);
assert.deepEqual(kinds(after(200 * HOUR)), ["fo:fo-ravi:1", "ifo:ifo-amit:1", "pending:hyderabad:1"]); // and stays flagged

// The headline numbers agree: 3 late cards, the oldest 24 hours and a minute.
const at25 = computeDashboard(items, events, people, hubs, { hub: "", days: 7, now: after(24 * HOUR + MIN) });
assert.equal(at25.lateCards, 3);
assert.equal(Math.round(at25.oldestLateHours! * 60), 24 * 60 + 1);

// Day two, 10:00 IST: the IFO's cards arrive at Hyderabad and the IM there receives the pending one (26 h in).
receive(after(26 * HOUR), "SD-2", "hyderabad");
receive(after(26 * HOUR), "SD-3", "hyderabad");
assert.deepEqual(kinds(after(26 * HOUR)), ["fo:fo-ravi:1"]); // only the FO is still holding cards

// The FO brings the card back, 30 hours in: nothing is late any more.
receive(after(30 * HOUR), "SD-1", "bangalore");
assert.deepEqual(kinds(after(30 * HOUR)), []);
assert.deepEqual(kinds(after(500 * HOUR)), []); // received cards are never flagged later

// Sending the same card out again starts a fresh 24 hours, not the old one.
const second = after(31 * HOUR);
send(second, "SD-1", "fo-ravi", "bangalore");
assert.deepEqual(kinds(new Date(second.getTime() + 23 * HOUR)), []);
assert.deepEqual(kinds(new Date(second.getTime() + 24 * HOUR)), []);
assert.deepEqual(kinds(new Date(second.getTime() + 24 * HOUR + MIN)), ["fo:fo-ravi:1"]);

// Several cards with one FO are one line, counted together, with the oldest time.
send(after(40 * HOUR), "SD-5", "fo-ravi", "bangalore");
// At 64h05m in: SD-1 went out at 31h (33h05m ago) and SD-5 at 40h (24h05m ago). Both are past 24 hours.
const many = late(after(64 * HOUR + 5 * MIN)).filter((g) => g.kind === "fo");
assert.equal(many.length, 1); // one line for Ravi, not one per card
assert.equal(many[0].count, 2);
assert.equal(Math.round(many[0].oldestHours * 60), 33 * 60 + 5); // the oldest card's time, 33h05m

console.log("24 hour tests passed");
