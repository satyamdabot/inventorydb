import assert from "node:assert/strict";
import { planReceive, planSend, type HandoverContext } from "../src/lib/handover";
import { classifyScans, collectIds } from "../src/lib/scan";
import type { Hub, Item, Person } from "../src/lib/schema";

const hubs: Hub[] = ["bangalore", "kadapa"].map((id) => ({
  hub_id: id,
  name: id,
  city: id,
  is_central: id === "bangalore" ? "true" : "false",
  active: "true",
  parent_hub: "",
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
  price: "",
  ...over,
});
let n = 0;
const ctx: HandoverContext = {
  hubs,
  people,
  actorPersonId: "im-blr",
  by: "im@x.com",
  now: "2026-09-25T15:30:00+05:30",
  newId: (p) => `${p}-${++n}`,
};

// Each recipient role gives the right status and hub.
const toIm = planSend([item("A")], { recipient: "im-kad", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
assert.deepEqual(toIm.errors, []);
assert.equal(toIm.items[0].status, "pending");
assert.equal(toIm.items[0].current_hub, "kadapa");
assert.equal(toIm.items[0].current_holder, "im-kad");

const toIfo = planSend([item("A")], { recipient: "ifo-amit", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx);
assert.equal(toIfo.items[0].status, "traveling");
assert.equal(toIfo.items[0].current_hub, "bangalore"); // recorded at the location that was chosen (Bangalore here)

assert.equal(planSend([item("A")], { recipient: "fo-ravi", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx).items[0].status, "with_fo");
assert.equal(planSend([item("A")], { recipient: "rig-s", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx).items[0].status, "with_rig");

// One event per card, one batch, actor recorded, last event linked on the item.
const batch = planSend([item("A"), item("B"), item("C")], { recipient: "fo-ravi", toHub: "bangalore", fromHub: "bangalore", note: "field trip" }, ctx);
assert.equal(batch.events.length, 3);
assert.equal(new Set(batch.events.map((e) => e.batch_id)).size, 1);
assert.equal(batch.events[0].action, "check_out");
assert.equal(batch.events[0].from_person, "im-blr");
assert.equal(batch.events[0].note, "field trip");
assert.equal(batch.items[2].last_event_id, batch.events[2].event_id);

// Only in-stock cards can be sent; unknown or inactive recipients are refused. Nothing is planned.
const blocked = planSend([item("A"), item("B", { status: "traveling" }), item("C", { status: "lost" })], { recipient: "fo-ravi", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx);
assert.match(blocked.errors[0], /B \(traveling\), C \(lost\)/);
assert.equal(blocked.events.length, 0);
assert.match(planSend([item("A")], { recipient: "fo-gone", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx).errors[0], /Choose the person/); // inactive person
assert.match(planSend([item("A")], { recipient: "", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx).errors[0], /Choose the person/);

// Receive puts cards back in stock at the chosen hub with no holder.
const back = planReceive(
  [
    item("A", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" }),
    item("B", { status: "traveling", current_holder: "ifo-amit", current_hub: "kadapa" }),
  ],
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

// Hub-lock: IM, IFO and the rig team must be received at the exact hub they were sent to. An FO card has
// no fixed hub (any IM can collect it back from wherever), so it's received anywhere with no error.
assert.match(
  planReceive([item("A", { status: "traveling", current_holder: "ifo-amit", current_hub: "bangalore" })], { hub: "kadapa", note: "" }, ctx).errors[0],
  /Sent to a different hub/,
);
assert.match(
  planReceive([item("A", { status: "with_rig", current_holder: "rig-s", current_hub: "bangalore" })], { hub: "kadapa", note: "" }, ctx).errors[0],
  /Sent to a different hub/,
);
assert.deepEqual(
  planReceive([item("A", { status: "with_fo", current_holder: "fo-ravi", current_hub: "bangalore" })], { hub: "kadapa", note: "" }, ctx).errors,
  [],
);
assert.deepEqual(
  planReceive([item("A", { status: "with_internal", current_holder: "Some Name", current_hub: "bangalore" })], { hub: "kadapa", note: "" }, ctx).errors,
  [],
);

// Count mismatch is flagged in the note, not blocked.
const short = planReceive([item("A", { status: "pending", current_holder: "im-kad", current_hub: "kadapa" })], { hub: "kadapa", note: "one missing", expected: 3 }, ctx);
assert.equal(short.mismatch, "Mismatch: expected 3, received 1.");
assert.equal(short.events[0].note, "Mismatch: expected 3, received 1. one missing");

// Cards that are not waiting to be received are refused.
assert.match(planReceive([item("A")], { hub: "kadapa", note: "" }, ctx).errors[0], /not waiting/);
assert.match(planReceive([item("A", { status: "pending" })], { hub: "mars", note: "" }, ctx).errors[0], /receiving hub/);

// A send always needs BOTH a person and a location. Either one missing refuses it, and nothing is saved.
const noPerson = planSend([item("A")], { recipient: "", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
assert.deepEqual(noPerson.errors, ["Choose the person the items are going to."]);
const noLocation = planSend([item("A")], { recipient: "fo-ravi", toHub: "", fromHub: "bangalore", note: "" }, ctx);
assert.deepEqual(noLocation.errors, ["Choose the location the items are going to."]);
const neither = planSend([item("A")], { recipient: "", toHub: "", fromHub: "bangalore", note: "" }, ctx);
assert.equal(neither.errors.length, 2); // both problems are reported together
assert.equal(noPerson.events.length + noLocation.events.length + neither.events.length, 0);
assert.match(planSend([item("A")], { recipient: "fo-ravi", toHub: "mars", fromHub: "bangalore", note: "" }, ctx).errors[0], /location/); // unknown hub

// The person sets the status and the holder; the location sets where the cards are recorded.
const toKadapaFo = planSend([item("A")], { recipient: "fo-ravi", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
assert.deepEqual(toKadapaFo.errors, []);
assert.equal(toKadapaFo.items[0].status, "with_fo");
assert.equal(toKadapaFo.items[0].current_holder, "fo-ravi");
assert.equal(toKadapaFo.items[0].current_hub, "kadapa");
assert.equal(toKadapaFo.events[0].hub, "kadapa");
assert.equal(toKadapaFo.events[0].to_id, "fo-ravi");
assert.equal(toKadapaFo.events[0].from_hub, "bangalore");
// The person's own hub does not matter: the same FO sent to Bangalore is recorded at Bangalore.
assert.equal(planSend([item("A")], { recipient: "fo-ravi", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx).items[0].current_hub, "bangalore");
// A traveling IFO is recorded at the location the cards are heading to.
const ifoToKadapa = planSend([item("A")], { recipient: "ifo-amit", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
assert.equal(ifoToKadapa.items[0].status, "traveling");
assert.equal(ifoToKadapa.items[0].current_hub, "kadapa");
// ...and an IM at a location: pending there, received there.
const gotIt = planReceive(toIm.items, { hub: "kadapa", note: "" }, ctx);
assert.deepEqual(gotIt.errors, []);
assert.equal(gotIt.items[0].status, "in_stock");

// "Internal": a typed name instead of a picked person. No row in People is needed or created.
const toInternal = planSend([item("A")], { internalName: "Suresh Kumar", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
assert.deepEqual(toInternal.errors, []);
assert.equal(toInternal.items[0].status, "with_internal");
assert.equal(toInternal.items[0].current_holder, "Suresh Kumar"); // the typed name itself, not a person_id
assert.equal(toInternal.items[0].current_hub, "kadapa");
assert.equal(toInternal.events[0].to_person, "Suresh Kumar"); // displayName falls back to the name when no person matches
assert.equal(toInternal.events[0].to_id, "Suresh Kumar");
// Surrounding whitespace in the typed name is trimmed, same as everywhere else free text is accepted.
assert.equal(planSend([item("A")], { internalName: "  Suresh Kumar  ", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx).items[0].current_holder, "Suresh Kumar");
// A blank or whitespace-only name is not a valid Internal send: falls through to needing a real recipient.
assert.match(planSend([item("A")], { internalName: "", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx).errors[0], /Choose the person/);
assert.match(planSend([item("A")], { internalName: "   ", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx).errors[0], /Choose the person/);
// internalName wins over recipient if a form somehow sends both.
const both = planSend([item("A")], { internalName: "Suresh Kumar", recipient: "fo-ravi", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
assert.equal(both.items[0].status, "with_internal");
assert.equal(both.items[0].current_holder, "Suresh Kumar");
// An Internal card can be received back into stock, the same as an FO, IFO or rig team card.
const internalBack = planReceive(toInternal.items, { hub: "kadapa", note: "" }, ctx);
assert.deepEqual(internalBack.errors, []);
assert.equal(internalBack.items[0].status, "in_stock");
assert.equal(internalBack.events[0].from_person, "Suresh Kumar");

// Every checkout and receive is stamped with the exact date and time it was saved, on the event and the card.
const stamped = planSend([item("A"), item("B")], { recipient: "fo-ravi", toHub: "bangalore", fromHub: "bangalore", note: "" }, ctx);
assert.ok(stamped.events.every((e) => e.occurred_at === ctx.now && e.recorded_at === ctx.now));
assert.equal(stamped.items[0].updated_at, ctx.now);
assert.match(stamped.events[0].occurred_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // date AND time
const stampedBack = planReceive(stamped.items, { hub: "kadapa", note: "" }, ctx);
assert.ok(stampedBack.events.every((e) => e.occurred_at === ctx.now && e.recorded_at === ctx.now));
// A form value can no longer change the time: extra fields are ignored.
const sneaky = planSend([item("A")], { recipient: "fo-ravi", toHub: "bangalore", fromHub: "bangalore", note: "", checkoutDate: "2020-01-01" } as never, ctx);
assert.equal(sneaky.events[0].occurred_at, ctx.now);

// Scan text: one per line, duplicates and blanks dropped, ticked ids merged.
assert.deepEqual(collectIds("SD-1\r\nSD-2\n\nSD-1\n", ["SD-3", "SD-2"]), ["SD-3", "SD-2", "SD-1"]);

// Your exact case: sent to the Kadapa location, then someone receives at Bangalore. Refused, nothing saved.
const sentToKadapa = planSend([item("A"), item("B")], { recipient: "im-kad", toHub: "kadapa", fromHub: "bangalore", note: "" }, ctx);
const wrongHub = planReceive(sentToKadapa.items, { hub: "bangalore", note: "" }, ctx);
assert.match(wrongHub.errors[0], /Sent to a different hub: A \(to kadapa\), B \(to kadapa\)\. Receive them at that hub, not bangalore/);
assert.equal(wrongHub.events.length, 0);
assert.equal(wrongHub.items.length, 0);
// Received at Kadapa it works, and the cards are in stock at Kadapa, ready for the next step there.
const rightHub = planReceive(sentToKadapa.items, { hub: "kadapa", note: "" }, ctx);
assert.deepEqual(rightHub.errors, []);
assert.ok(rightHub.items.every((i) => i.status === "in_stock" && i.current_hub === "kadapa"));
// Only cards sent TO a hub are tied to it: a card returning from an FO is received wherever the receiver is.
const fromFo = item("C", { status: "with_fo", current_holder: "fo-ravi", current_hub: "kadapa" });
assert.deepEqual(planReceive([fromFo], { hub: "bangalore", note: "" }, ctx).errors, []);

// Your case: a Bangalore FO who works at Kadapa. Sent from Kadapa to Kadapa, the cards are in the field at Kadapa.
const bengaluruFo = { ...ctx, people: [...people, person("fo-blr", "fo", "bangalore")] };
const kadapaFo = planSend([item("K9", { current_hub: "kadapa" })], { toHub: "kadapa", fromHub: "kadapa", recipient: "fo-blr", note: "" }, bengaluruFo);
assert.deepEqual(kadapaFo.errors, []);
assert.equal(kadapaFo.items[0].status, "with_fo");
assert.equal(kadapaFo.items[0].current_hub, "kadapa"); // the location chosen, not the FO's home hub
assert.equal(kadapaFo.items[0].current_holder, "fo-blr");
// The rig team and an IM follow the same rule: the location that was chosen.
assert.equal(planSend([item("K9", { current_hub: "kadapa" })], { toHub: "kadapa", fromHub: "kadapa", recipient: "rig-s", note: "" }, ctx).items[0].current_hub, "kadapa");
assert.equal(planSend([item("K9")], { toHub: "kadapa", fromHub: "bangalore", recipient: "im-kad", note: "" }, ctx).items[0].current_hub, "kadapa");
// Sending to a different location than where the cards left from is allowed: that is the point of the field.
assert.equal(planSend([item("K9")], { toHub: "kadapa", fromHub: "bangalore", recipient: "fo-ravi", note: "" }, ctx).items[0].current_hub, "kadapa");

// "Sending from": every card must be in stock at that hub. Choosing the right hub is the fix.
const atKadapa = item("K1", { current_hub: "kadapa", home_hub: "kadapa" });
const atBlr = item("B1");
const okFrom = planSend([atBlr], { toHub: "bangalore", fromHub: "bangalore", recipient: "fo-ravi", note: "" }, ctx);
assert.deepEqual(okFrom.errors, []);
assert.equal(okFrom.events[0].from_hub, "bangalore"); // where it left from
assert.equal(okFrom.events[0].hub, "bangalore"); // it stays at the hub it was sent from, not the FO's hub (Kadapa)
const wrongFrom = planSend([atBlr, atKadapa], { toHub: "bangalore", fromHub: "bangalore", recipient: "fo-ravi", note: "" }, ctx);
assert.match(wrongFrom.errors[0], /Not at bangalore: K1 \(at kadapa\)\. Choose that hub in "Sending from"/);
assert.equal(wrongFrom.events.length, 0);
assert.deepEqual(planSend([atKadapa], { toHub: "bangalore", fromHub: "kadapa", recipient: "fo-ravi", note: "" }, ctx).errors, []);
assert.match(planSend([atBlr], { toHub: "bangalore", fromHub: "", recipient: "fo-ravi", note: "" }, ctx).errors[0], /hub you are sending from/);
assert.match(planSend([atBlr], { toHub: "bangalore", fromHub: "mars", recipient: "fo-ravi", note: "" }, ctx).errors[0], /hub you are sending from/);
// Receive and correction record the hub the card was at before as well.
assert.equal(planReceive([item("Z", { status: "pending", current_hub: "kadapa" })], { hub: "kadapa", note: "" }, ctx).events[0].from_hub, "kadapa");

// The log stores NAMES in from_person / to_person, and the ids alongside in from_id / to_id.
const named: Person[] = [
  { person_id: "p-mihir", name: "Mihir Joshi", role: "im", hub: "bangalore", linked_user: "", active: "true" },
  { person_id: "p-ravi", name: "Ravi Patil", role: "fo", hub: "kadapa", linked_user: "", active: "true" },
];
const namedCtx: HandoverContext = { ...ctx, people: named, actorPersonId: "p-mihir" };
const sentNamed = planSend([item("A")], { recipient: "p-ravi", toHub: "bangalore", fromHub: "bangalore", note: "" }, namedCtx);
assert.equal(sentNamed.events[0].from_person, "Mihir Joshi");
assert.equal(sentNamed.events[0].to_person, "Ravi Patil");
assert.equal(sentNamed.events[0].from_id, "p-mihir");
assert.equal(sentNamed.events[0].to_id, "p-ravi");
assert.equal(sentNamed.items[0].current_holder, "p-ravi"); // the card row still points at the id
const recvNamed = planReceive(sentNamed.items, { hub: "bangalore", note: "" }, namedCtx);
assert.equal(recvNamed.events[0].from_person, "Ravi Patil");
assert.equal(recvNamed.events[0].to_person, "Mihir Joshi");
// An admin with no person record is stored by email, in both the name and id columns.
const adminCtx: HandoverContext = { ...namedCtx, actorPersonId: "sraj@x.com" };
const byAdmin = planSend([item("A")], { recipient: "p-ravi", toHub: "bangalore", fromHub: "bangalore", note: "" }, adminCtx);
assert.equal(byAdmin.events[0].from_person, "sraj@x.com");
assert.equal(byAdmin.events[0].from_id, "sraj@x.com");

// Live scan check: what the box shows before saving.
const known = new Map([["SD-1", "in_stock"], ["SD-2", "traveling"], ["SD-3", "in_stock"]]);
const sendable = new Set(["in_stock"]);
const rows = classifyScans("SD-1\r\nSD-2\nSD-1\n\nSD-9\nSD-3SD-1", known, sendable);
assert.deepEqual(rows.map((r) => r.state), ["ok", "wrong", "duplicate", "unknown", "unknown"]);
assert.equal(rows[1].status, "traveling");
assert.equal(rows[4].code, "SD-3SD-1"); // two scans run together (no Enter after each) is visible as one odd line
assert.deepEqual(classifyScans("", known, sendable), []);

// Letter case is ignored: a scanner with Caps Lock on types every capital as lowercase.
const serials = new Map([["SD-5471Y1AL61UX", "in_stock"], ["SD-5367X19716H5", "traveling"]]);
const lower = classifyScans("sd-5471y1al61ux\nSD-5471Y1AL61UX\nsd-5367x19716h5\ncn0723jgloc002abajraa01", serials, sendable);
assert.deepEqual(lower.map((r) => r.state), ["ok", "duplicate", "wrong", "unknown"]); // same card in two cases counts once
assert.equal(lower[0].id, "SD-5471Y1AL61UX"); // resolves to the stored serial
assert.equal(lower[0].code, "sd-5471y1al61ux"); // and remembers what was typed
assert.equal(lower[2].status, "traveling");
assert.equal(lower[3].id, undefined); // a different barcode is still not found

console.log("handover tests passed");
