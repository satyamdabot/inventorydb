import assert from "node:assert/strict";
import { getStore } from "../src/lib/store";
import type { Item, ItemEvent } from "../src/lib/schema";

// Exercises the Store on the in-memory backend.
process.env.STORE = "memory";
const store = getStore();
await store.init();

const now = new Date().toISOString();
const item = (id: string, over: Partial<Item> = {}): Item => ({
  item_id: id,
  item_type: "sd_card",
  home_hub: "BLR",
  current_hub: "BLR",
  status: "in_stock",
  current_holder: "",
  last_event_id: "",
  updated_at: now,
  attributes: "{}",
  prism_no: "",
  brand: "",
  model: "",
  ...over,
});
const event = (id: string, item_id: string, over: Partial<ItemEvent> = {}): ItemEvent => ({
  event_id: id,
  batch_id: "B1",
  item_id,
  action: "check_out",
  from_person: "im-blr",
  to_person: "ifo-amit",
  from_id: "im-blr",
  to_id: "ifo-amit",
  hub: "BLR",
  status_after: "traveling",
  occurred_at: now,
  recorded_at: now,
  recorded_by: "im@example.com",
  note: "",
  ...over,
});

await store.upsert("items", [item("SD-00001"), item("SD-00002")]);
assert.equal((await store.list("items")).length, 2);

// A batch handover updates both cards and appends two events.
await store.commitBatch(
  [event("E1", "SD-00001"), event("E2", "SD-00002")],
  [
    item("SD-00001", { status: "traveling", current_holder: "ifo-amit", last_event_id: "E1" }),
    item("SD-00002", { status: "traveling", current_holder: "ifo-amit", last_event_id: "E2" }),
  ],
);
assert.equal((await store.list("items")).length, 2); // upsert did not duplicate
assert.equal((await store.getItem("SD-00001"))?.status, "traveling");
assert.equal((await store.getHistory("SD-00002")).length, 1);
assert.deepEqual(await store.checkConsistency(), []);

// Items row left behind after an event is detected.
await store.commitBatch([event("E3", "SD-00001", { status_after: "in_stock" })], []);
const problems = await store.checkConsistency();
assert.equal(problems.length, 1);
assert.equal(problems[0].item_id, "SD-00001");

console.log("smoke test passed");
