import assert from "node:assert/strict";
import { computeDashboard } from "../src/lib/dashboard";
import type { Hub, Item, ItemEvent, Person } from "../src/lib/schema";

const hub = (id: string): Hub => ({ hub_id: id, name: id, city: id, is_central: "false", active: "true", parent_hub: "" });
const hubs = [hub("bangalore"), hub("kadapa"), hub("empty")];
const person = (id: string, role: Person["role"]): Person => ({ person_id: id, name: id, role, hub: "kadapa", linked_user: "", active: "true" });
const people = [person("fo-ravi", "fo"), person("im-kad", "im")];
const item = (id: string, over: Partial<Item> = {}): Item => ({
  item_id: id, item_type: "sd_card", home_hub: "bangalore", current_hub: "bangalore", status: "in_stock",
  current_holder: "", last_event_id: "", updated_at: "", attributes: "", prism_no: "", brand: "", model: "", ...over,
});
const event = (id: string, item_id: string, over: Partial<ItemEvent> = {}): ItemEvent => ({
  event_id: id, batch_id: "b", item_id, action: "check_out", from_person: "", to_person: "", from_id: "", to_id: "", from_hub: "", hub: "kadapa",
  status_after: "with_fo", occurred_at: "2026-09-20T10:00:00Z", recorded_at: "2026-09-20T10:00:00Z", recorded_by: "x", note: "", ...over,
});
const now = new Date("2026-09-25T12:00:00Z");

const items = [
  item("A"),
  item("B", { status: "with_fo", current_hub: "kadapa", current_holder: "fo-ravi", last_event_id: "E1" }),
  item("C", { status: "with_fo", current_hub: "kadapa", current_holder: "fo-ravi", last_event_id: "E2" }),
  item("D", { status: "pending", current_hub: "kadapa", current_holder: "im-kad", last_event_id: "E3", home_hub: "kadapa" }),
  item("E", { status: "lost" }),
];
const events = [
  event("E1", "B", { occurred_at: "2026-09-15T10:00:00Z" }),
  event("E2", "C", { occurred_at: "2026-09-24T10:00:00Z" }),
  event("E3", "D", { status_after: "pending", occurred_at: "2026-09-25T08:00:00Z" }),
  event("E4", "A", { action: "receive", status_after: "in_stock", hub: "bangalore", occurred_at: "2026-09-25T09:00:00Z" }),
  event("E5", "A", { action: "correct", status_after: "in_stock", hub: "bangalore", occurred_at: "2026-09-25T09:30:00Z" }),
];

const d = computeDashboard(items, events, people, hubs, { hub: "", days: 7, now });

assert.equal(d.total, 5);
assert.equal(d.byStatus.in_stock, 1);
assert.equal(d.byStatus.with_fo, 2);
assert.equal(d.byStatus.pending, 1);
assert.equal(d.byStatus.lost, 1);
assert.equal(d.outCount, 3);

// B out 10 days, C out 1 day, D out 0 days.
assert.equal(d.longestOut[0].item_id, "B");
assert.equal(d.longestOut[0].days, 10);
assert.equal(d.lateCards, 2); // B (10 days with an FO) and C (26 hours with an FO); D was sent 4 hours ago
assert.equal(Math.round(d.oldestLateHours!), 242); // B: handed over on the 15th at 10:00, now is the 25th at 12:00 = 10 days 2 hours

// Management numbers. Five cards: 1 in stock, 2 with the FO, 1 pending, 1 lost. The lost card is not usable.
assert.equal(d.usable, 4);
assert.equal(d.utilization, 75); // 3 out of 4 usable cards
assert.equal(d.waiting, 1); // card D, pending
assert.equal(d.oldestWaitingDays, 0); // sent this morning
assert.equal(computeDashboard(items, events, people, hubs, { hub: "empty", days: 7, now }).utilization, null); // no cards, no ratio
const traveling = [{ ...items[0], status: "traveling" as const, current_holder: "fo-ravi", last_event_id: "E4" }, ...items.slice(1)];
const t = computeDashboard(traveling, events, people, hubs, { hub: "", days: 7, now });
assert.equal(t.waiting, 2); // traveling cards count as waiting too
assert.equal(t.utilization, 100); // 4 of 4 usable are out
// A fleet where everything is lost has no usable cards, so no utilization figure.
const allLost = items.map((i) => ({ ...i, status: "lost" as const }));
assert.equal(computeDashboard(allLost, events, people, hubs, { hub: "", days: 7, now }).utilization, null);

// Needs attention: an FO or IFO holding cards, or cards sent to a hub, for MORE than 24 hours.
const H = 3_600_000;
const hoursAgo = (h: number) => new Date(now.getTime() - h * H).toISOString();
const lateItems = [
  item("F1", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }), // 30 h: late
  item("F2", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }), // 50 h: late
  item("F3", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }), // 5 h: fine
  item("F4", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }), // exactly 24 h: not late
  item("F5", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }), // 24 h and 1 minute: late
  item("T1", { status: "traveling", current_holder: "ifo-amit" }), // 40 h: late
  item("T2", { status: "traveling", current_holder: "ifo-amit" }), // 3 h: fine
  item("P1", { status: "pending", current_holder: "im-kad", current_hub: "kadapa" }), // 26 h: late
  item("R1", { status: "with_rig", current_holder: "rig-s" }), // 300 h: the rig team has no 24 hour rule
  item("S1"), // in stock for ever: never late
];
const lateEvents = [
  event("L1", "F1", { occurred_at: hoursAgo(30) }), event("L2", "F2", { occurred_at: hoursAgo(50) }),
  event("L3", "F3", { occurred_at: hoursAgo(5) }), event("L4", "F4", { occurred_at: hoursAgo(24) }),
  event("L5", "F5", { occurred_at: hoursAgo(24 + 1 / 60) }), event("L6", "T1", { occurred_at: hoursAgo(40) }),
  event("L7", "T2", { occurred_at: hoursAgo(3) }), event("L8", "P1", { occurred_at: hoursAgo(26) }),
  event("L9", "R1", { occurred_at: hoursAgo(300) }), event("L10", "S1", { occurred_at: hoursAgo(900) }),
];
const latePeople = [...people, person("ifo-amit", "ifo"), person("rig-s", "rig")];
const lateDash = computeDashboard(lateItems, lateEvents, latePeople, hubs, { hub: "", days: 7, now });
const fo = lateDash.late.find((g) => g.kind === "fo")!;
assert.deepEqual([fo.key, fo.label, fo.count], ["fo-ravi", "fo-ravi", 3]); // F1, F2 and the one 1 minute over. Not F3, not exactly 24 h
assert.equal(Math.round(fo.oldestHours), 50);
const ifo = lateDash.late.find((g) => g.kind === "ifo")!;
assert.deepEqual([ifo.key, ifo.count], ["ifo-amit", 1]);
assert.equal(Math.round(ifo.oldestHours), 40);
const pend = lateDash.late.find((g) => g.kind === "pending")!;
assert.deepEqual([pend.key, pend.label, pend.count], ["kadapa", "kadapa", 1]); // grouped by the hub it was sent to
assert.equal(lateDash.late.length, 3); // nothing for the rig team or for stock
assert.equal(lateDash.lateCards, 5); // Ravi's 3, the IFO's 1, and the 1 sent to Kadapa
assert.equal(Math.round(lateDash.oldestLateHours!), 50);
assert.equal(computeDashboard([item("S3")], [], latePeople, hubs, { hub: "", days: 7, now }).lateCards, 0);
assert.equal(computeDashboard([item("S3")], [], latePeople, hubs, { hub: "", days: 7, now }).oldestLateHours, null);
assert.deepEqual(lateDash.late.map((g) => g.kind), ["fo", "ifo", "pending"]); // oldest first
// A card with no recorded movement time cannot be judged, so it is not flagged.
const noTime = computeDashboard([item("N1", { status: "with_fo", current_holder: "fo-ravi" })], [], latePeople, hubs, { hub: "", days: 7, now });
assert.deepEqual(noTime.late, []);
// Nothing out means nothing late.
assert.deepEqual(computeDashboard([item("S2")], [], latePeople, hubs, { hub: "", days: 7, now }).late, []);

// Holders: Ravi has 2, oldest 10 days. Pending is grouped by destination hub.
assert.deepEqual(d.holders[0], { person_id: "fo-ravi", name: "fo-ravi", role: "fo", count: 2, oldestDays: 10 });
assert.deepEqual(d.pending, [{ hub_id: "kadapa", name: "kadapa", count: 1, oldestDays: 0 }]);

// Hub table: owned vs held, hubs with nothing are left out.
const kadapa = d.hubs.find((h) => h.hub_id === "kadapa")!;
assert.deepEqual({ owned: kadapa.owned, held: kadapa.held, out: kadapa.out }, { owned: 1, held: 3, out: 3 });
assert.equal(d.hubs.find((h) => h.hub_id === "bangalore")!.owned, 4);
// Each hub shows what its cards are doing: Kadapa holds 2 with the FO and 1 incoming (pending).
assert.equal(kadapa.byStatus.with_fo, 2);
assert.equal(kadapa.byStatus.pending, 1);
assert.equal(kadapa.byStatus.in_stock, 0);
assert.equal(d.hubs.find((h) => h.hub_id === "empty"), undefined);

// Activity: one bucket per day, oldest first, counts by action.
assert.equal(d.activity.length, 7);
assert.equal(d.activity[0].date, "2026-09-19");
assert.equal(d.activity[6].date, "2026-09-25");
assert.deepEqual(d.activity[6], { date: "2026-09-25", sent: 1, received: 1, corrected: 1 });
assert.equal(d.activity[1].sent, 0); // 2026-09-20: quiet day, still a bucket
assert.equal(d.activity[5].sent, 1); // 2026-09-24: card C sent
// The 15th (card B) is outside the 7-day window and is not counted anywhere.
assert.equal(d.activity.reduce((n, day) => n + day.sent, 0), 2);
assert.equal(d.noHistory, 1); // card E has no events
assert.deepEqual(d.inconsistencies.map((p) => p.item_id), ["A"]); // A's row does not point at its last event

// Days are India days. 20:00 UTC on the 24th is 1:30 am IST on the 25th, so it counts on the 25th,
// whether it was saved as UTC ("Z") or as IST (+05:30).
for (const at of ["2026-09-24T20:00:00Z", "2026-09-25T01:30:00+05:30"]) {
  const ist = computeDashboard(items, [event("E9", "B", { occurred_at: at })], people, hubs, { hub: "", days: 7, now });
  assert.equal(ist.activity[6].date, "2026-09-25");
  assert.equal(ist.activity[6].sent, 1);
  assert.equal(ist.activity[5].sent, 0);
}

// A scope of several hubs (a hub and the ones under it) counts them together.
const both = computeDashboard(items, events, people, hubs, { hub: "", scope: ["bangalore", "kadapa"], days: 7, now });
assert.equal(both.total, 5);
assert.equal(computeDashboard(items, events, people, hubs, { hub: "", scope: ["kadapa"], days: 7, now }).total, 3);
assert.equal(computeDashboard(items, events, people, hubs, { hub: "", scope: ["empty"], days: 7, now }).total, 0);
assert.equal(both.activity[6].sent, 1); // the day's send at Kadapa is inside the scope

// Hub filter scopes current-state numbers and events.
const k = computeDashboard(items, events, people, hubs, { hub: "kadapa", days: 7, now });
assert.equal(k.total, 3);
assert.equal(k.byStatus.in_stock, 0);
assert.equal(k.activity[6].received, 0);
assert.equal(k.activity[6].sent, 1);

console.log("dashboard tests passed");
