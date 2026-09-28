import assert from "node:assert/strict";
import { extractBatchId, formatPrice, summarizeBatch } from "../src/lib/receipt";
import type { Hub, Item, ItemEvent } from "../src/lib/schema";

// extractBatchId: works whether the scanner reads the receipt's URL (the normal case) or a bare id.
assert.equal(extractBatchId("b-1234abcd"), "b-1234abcd");
assert.equal(extractBatchId("https://inventorydb-kappa.vercel.app/handover/receipt/b-1234abcd"), "b-1234abcd");
assert.equal(extractBatchId("https://inventorydb-kappa.vercel.app/handover/receipt/b-1234abcd/"), "b-1234abcd");
assert.equal(extractBatchId("https://inventorydb-kappa.vercel.app/handover/receipt/b-1234abcd?x=1"), "b-1234abcd");
assert.equal(extractBatchId("https://inventorydb-kappa.vercel.app/handover/receipt/b-1234abcd#top"), "b-1234abcd");
assert.equal(extractBatchId("  b-1234abcd  \n"), "b-1234abcd"); // scanners often add a trailing newline
assert.equal(extractBatchId(""), "");
assert.equal(extractBatchId("   "), "");

// formatPrice: a plain rupee figure, or nothing when there is no usable price.
assert.equal(formatPrice("7500"), "₹7,500");
assert.equal(formatPrice("1250.5"), "₹1,250.5");
assert.equal(formatPrice("0"), "₹0");
assert.equal(formatPrice(""), "");
assert.equal(formatPrice("  "), "");
assert.equal(formatPrice("n/a"), "");

// summarizeBatch: three cards sent in one batch.
const hubs: Hub[] = [{ hub_id: "kadapa", name: "Kadapa", city: "Kadapa", is_central: "false", active: "true", parent_hub: "" }];
const item = (id: string, over: Partial<Item> = {}): Item => ({
  item_id: id, item_type: "sd_card", home_hub: "bangalore", current_hub: "kadapa", status: "with_fo",
  current_holder: "p-ravi", last_event_id: "", updated_at: "", attributes: "", prism_no: `P-${id}`,
  brand: "SanDisk", model: "Extreme A2 V30", price: "7500", ...over,
});
const items = [item("SD-3"), item("SD-1"), item("SD-2", { brand: "Kingston", price: "6000" })];
const event = (item_id: string, over: Partial<ItemEvent> = {}): ItemEvent => ({
  event_id: `e-${item_id}`, batch_id: "b-1", item_id, action: "check_out", from_person: "Mihir Joshi",
  to_person: "Ravi Patil", from_id: "p-mihir", to_id: "p-ravi", hub: "kadapa", from_hub: "bangalore",
  status_after: "with_fo", occurred_at: "2026-09-26T10:00:00+05:30", recorded_at: "2026-09-26T10:00:00+05:30",
  recorded_by: "mihir@x.com", note: "field trip", ...over,
});
const events = [event("SD-1"), event("SD-2"), event("SD-3"), event("OTHER", { batch_id: "b-2" })];

const s = summarizeBatch(events, items, hubs, "b-1")!;
assert.ok(s);
assert.equal(s.batchId, "b-1");
assert.equal(s.action, "check_out");
assert.equal(s.occurredAt, "2026-09-26T10:00:00+05:30");
assert.equal(s.fromName, "Mihir Joshi");
assert.equal(s.toName, "Ravi Patil");
assert.equal(s.hubId, "kadapa");
assert.equal(s.hubName, "Kadapa");
assert.equal(s.note, "field trip");
assert.equal(s.items.length, 3); // the "OTHER" item from a different batch is not included
assert.deepEqual(s.items.map((i) => i.itemId), ["SD-1", "SD-2", "SD-3"]); // sorted, not event order
assert.equal(s.items[1].brand, "Kingston");
assert.equal(s.items[0].price, "7500");
assert.equal(s.items[1].price, "6000");
assert.equal(s.items[0].statusAfter, "with_fo");
assert.equal(s.totalPrice, 7500 + 6000 + 7500); // SD-1, SD-2, SD-3

// A card with no price on file (blank, or not a number) is left out of the total, not treated as zero.
const mixed = summarizeBatch(events, [item("SD-1", { price: "" }), item("SD-2", { price: "n/a" }), item("SD-3", { price: "500" })], hubs, "b-1")!;
assert.equal(mixed.totalPrice, 500);
// If NO card has a usable price, the total is null (not 0), so the receipt can hide the row entirely.
const none = summarizeBatch(events, [item("SD-1", { price: "" }), item("SD-2", { price: "" }), item("SD-3", { price: "" })], hubs, "b-1")!;
assert.equal(none.totalPrice, null);

// An unknown batch id, or one that appears nowhere, is undefined rather than a crash.
assert.equal(summarizeBatch(events, items, hubs, "b-nope"), undefined);
assert.equal(summarizeBatch(events, items, hubs, ""), undefined);
assert.equal(summarizeBatch([], [], [], "b-1"), undefined);

// A card that has since been deleted from the items tab still appears, with blank details rather than a crash.
const gone = summarizeBatch(events, [], hubs, "b-1")!;
assert.equal(gone.items.length, 3);
assert.equal(gone.items[0].brand, "");
assert.equal(gone.items[0].price, "");
assert.equal(gone.totalPrice, null);

// An unknown hub id falls back to showing the id itself.
const noHub = summarizeBatch(events, items, [], "b-1")!;
assert.equal(noHub.hubName, "kadapa");

console.log("receipt tests passed");
