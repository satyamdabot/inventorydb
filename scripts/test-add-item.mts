import assert from "node:assert/strict";
import { planAddItem } from "../src/lib/add-item";
import type { Hub, Item } from "../src/lib/schema";

const hubs: Hub[] = [
  { hub_id: "bangalore", name: "Bangalore", city: "Bangalore", is_central: "true", active: "true", parent_hub: "" },
  { hub_id: "old", name: "Old hub", city: "Old", is_central: "false", active: "false", parent_hub: "" },
];
const existing: Item[] = [
  { item_id: "SD-1", item_type: "sd_card", home_hub: "bangalore", current_hub: "bangalore", status: "in_stock",
    current_holder: "", last_event_id: "", updated_at: "", attributes: "", prism_no: "", brand: "", model: "", price: "" },
];
const ctx = { hubs, by: "admin@x.com", now: "2026-09-29T16:00:00+05:30", newId: (() => { let n = 0; return (p: string) => `${p}-${++n}`; })() };
const input = (over: Partial<Parameters<typeof planAddItem>[0]> = {}) => ({
  itemId: "SD-2", homeHub: "bangalore", prismNo: "P-1", brand: "SanDisk", model: "Extreme A2", price: "7500", ...over,
});

// A new card: one event (action "import"), one item, in stock at its home hub, with its own history.
const ok = planAddItem(input(), existing, ctx);
assert.deepEqual(ok.errors, []);
assert.equal(ok.item!.item_id, "SD-2");
assert.equal(ok.item!.status, "in_stock");
assert.equal(ok.item!.home_hub, "bangalore");
assert.equal(ok.item!.current_hub, "bangalore");
assert.equal(ok.item!.current_holder, "");
assert.equal(ok.item!.prism_no, "P-1");
assert.equal(ok.item!.brand, "SanDisk");
assert.equal(ok.item!.price, "7500");
assert.equal(ok.event!.action, "import");
assert.equal(ok.event!.status_after, "in_stock");
assert.equal(ok.event!.hub, "bangalore");
assert.equal(ok.event!.recorded_by, "admin@x.com");
assert.equal(ok.item!.last_event_id, ok.event!.event_id); // the item points at its own creation event

// Whitespace around the typed fields is trimmed.
assert.equal(planAddItem(input({ itemId: "  SD-3  " }), existing, ctx).item!.item_id, "SD-3");

// A duplicate serial is refused, case-insensitively (matches how scanning works everywhere else). Nothing is planned.
const dup = planAddItem(input({ itemId: "sd-1" }), existing, ctx);
assert.match(dup.errors[0], /already in the inventory/);
assert.equal(dup.item, undefined);
assert.equal(dup.event, undefined);

// A blank serial, and an inactive or unknown home hub, are both refused.
assert.match(planAddItem(input({ itemId: "" }), existing, ctx).errors[0], /Scan or type/);
assert.match(planAddItem(input({ itemId: "  " }), existing, ctx).errors[0], /Scan or type/);
assert.match(planAddItem(input({ homeHub: "old" }), existing, ctx).errors[0], /Choose the home hub/);
assert.match(planAddItem(input({ homeHub: "mars" }), existing, ctx).errors[0], /Choose the home hub/);
// Both problems are reported together.
assert.equal(planAddItem(input({ itemId: "", homeHub: "" }), existing, ctx).errors.length, 2);

console.log("add-item tests passed");
