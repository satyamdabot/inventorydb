import assert from "node:assert/strict";
import { activityBaseline, differsFromBaseline } from "../src/lib/reset";
import type { Item } from "../src/lib/schema";

const card = (over: Partial<Item> = {}): Item => ({
  item_id: "SD-1", item_type: "sd_card", home_hub: "bangalore", current_hub: "kadapa", status: "with_fo",
  current_holder: "p-ravi", last_event_id: "e-99", updated_at: "2026-09-25T19:14:54+05:30",
  attributes: '{"x":1}', prism_no: "B584-4E36", brand: "SanDisk", model: "Extreme A2 V30", price: "7500", ...over,
});

// A card that has been out and about goes back to in stock at its home hub, held by nobody, with no history.
const b = activityBaseline(card());
assert.equal(b.status, "in_stock");
assert.equal(b.current_hub, "bangalore");
assert.equal(b.current_holder, "");
assert.equal(b.last_event_id, "");
assert.equal(b.updated_at, "");

// Nothing about what the card IS changes.
const before = card();
for (const key of ["item_id", "item_type", "home_hub", "attributes", "prism_no", "brand", "model"] as const) {
  assert.equal(b[key], before[key], `${key} must not change`);
}

// The original is not modified.
assert.equal(before.status, "with_fo");

// A card with no home hub stays where it is rather than losing its place.
assert.equal(activityBaseline(card({ home_hub: "", current_hub: "kadapa" })).current_hub, "kadapa");

// Only cards away from their starting position count as changed, so a second reset changes nothing.
assert.equal(differsFromBaseline(card()), true);
assert.equal(differsFromBaseline(card({ status: "in_stock", current_hub: "bangalore", current_holder: "", last_event_id: "" })), false);
assert.equal(differsFromBaseline(card({ status: "in_stock", current_hub: "bangalore", current_holder: "", last_event_id: "e-1" })), true); // still points at a deleted event
assert.equal(differsFromBaseline(activityBaseline(card())), false);

console.log("reset tests passed");
