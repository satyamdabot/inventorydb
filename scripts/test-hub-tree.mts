import assert from "node:assert/strict";
import { buildHubTree, findNode, pathTo, subtreeIds, wouldCreateCycle } from "../src/lib/hub-tree";
import type { Hub, Item, Status } from "../src/lib/schema";

const hub = (id: string, parent = ""): Hub => ({ hub_id: id, name: id, city: id, is_central: "false", active: "true", parent_hub: parent });
const card = (id: string, at: string, status: Status = "in_stock", home = "blr"): Item => ({
  item_id: id, item_type: "sd_card", home_hub: home, current_hub: at, status, current_holder: "", last_event_id: "",
  updated_at: "", attributes: "", prism_no: "", brand: "", model: "", price: "",
});

// Bangalore is the main hub. Kadapa and Hyderabad sit under it, and Kadapa-2 sits under Kadapa.
const hubs = [hub("blr"), hub("kad", "blr"), hub("hyd", "blr"), hub("kad2", "kad"), hub("lone")];
const items = [
  card("A", "blr"), card("B", "blr"), card("C", "blr", "with_fo"),
  card("D", "kad"), card("E", "kad", "pending"),
  card("F", "kad2", "with_fo"),
  card("G", "hyd", "traveling", "hyd"),
];

const roots = buildHubTree(hubs, items);
assert.deepEqual(roots.map((r) => r.hub.hub_id), ["blr", "lone"]); // top level: the main hub, and a hub with no parent
const blr = findNode(roots, "blr")!;
assert.deepEqual(blr.children.map((c) => c.hub.hub_id), ["kad", "hyd"]); // Kadapa holds more, so it comes first

// Every card is counted once, at the hub it is at, and rolled up to each ancestor.
assert.equal(blr.own.held, 3);
assert.equal(blr.total.held, 7); // all seven cards
assert.equal(findNode(roots, "kad")!.own.held, 2);
assert.equal(findNode(roots, "kad")!.total.held, 3); // Kadapa's own two plus Kadapa-2's one
assert.equal(findNode(roots, "kad2")!.total.held, 1);
assert.equal(roots.reduce((n, r) => n + r.total.held, 0), items.length); // nothing double counted, nothing lost

// The breakdown rolls up too.
assert.equal(blr.total.byStatus.in_stock, 3);
assert.equal(blr.total.byStatus.with_fo, 2); // C at Bangalore and F at Kadapa-2
assert.equal(blr.total.byStatus.pending, 1);
assert.equal(blr.total.byStatus.traveling, 1);
assert.equal(blr.total.inStock, 3);
assert.equal(blr.total.out, 4);
assert.equal(blr.own.out, 1);
assert.equal(findNode(roots, "kad")!.total.out, 2);

// Owned is by home hub, separate from where the cards are now.
assert.equal(blr.owned, 6);
assert.equal(findNode(roots, "hyd")!.owned, 1);

// Navigation helpers.
assert.deepEqual(subtreeIds(findNode(roots, "kad")!).sort(), ["kad", "kad2"]);
assert.deepEqual(subtreeIds(blr).sort(), ["blr", "hyd", "kad", "kad2"]);
assert.deepEqual(pathTo(findNode(roots, "kad2")!).map((n) => n.hub.hub_id), ["blr", "kad", "kad2"]);
assert.equal(findNode(roots, "nope"), undefined);

// A hub with no cards still appears, with zeros.
assert.equal(findNode(roots, "lone")!.total.held, 0);

// Bad parents never break the tree: unknown parent, self as parent, and a loop all become top-level.
const bad = [hub("a", "ghost"), hub("b", "b"), hub("c", "d"), hub("d", "c"), hub("root")];
const badRoots = buildHubTree(bad, []);
assert.equal(badRoots.length + badRoots.flatMap((r) => r.children).length + badRoots.flatMap((r) => r.children.flatMap((c) => c.children)).length, 5); // all five hubs are somewhere
assert.ok(badRoots.some((r) => r.hub.hub_id === "a"));
assert.ok(badRoots.some((r) => r.hub.hub_id === "b"));

// Editing: a hub can't be moved under itself or under one of its own sub-hubs.
assert.equal(wouldCreateCycle(hubs, "kad", "kad"), true);
assert.equal(wouldCreateCycle(hubs, "blr", "kad2"), true); // the main hub under its own grandchild
assert.equal(wouldCreateCycle(hubs, "kad", "kad2"), true);
assert.equal(wouldCreateCycle(hubs, "kad2", "hyd"), false); // moving Kadapa-2 under Hyderabad is fine
assert.equal(wouldCreateCycle(hubs, "hyd", ""), false); // no parent is always fine

console.log("hub tree tests passed");
