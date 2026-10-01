import { displayName } from "./actors";
import type { Hub, Item, ItemEvent, Person, Role, Status } from "./schema";

export interface HandoverContext {
  hubs: Hub[];
  people: Person[];
  actorPersonId: string; // who did the handover: an IM's person_id, or an admin's email
  by: string; // signed-in email, always saved as recorded_by
  now: string; // IST timestamp taken when the form is saved, used for every event in the batch
  newId: (prefix: string) => string;
}

export interface HandoverPlan {
  events: ItemEvent[];
  items: Item[];
  errors: string[];
  mismatch?: string;
}

export interface SendInput {
  fromHub: string; // hub_id the cards are being sent from; every card must be in stock there
  recipient?: string; // person_id of who the cards are handed to. Required unless internalName is set
  internalName?: string; // a typed name for the "Internal" category, used instead of recipient
  toHub: string; // hub_id of the location the cards are going to. Always required
  note: string;
}

// What a card becomes when an IM hands it to someone of each role.
const SEND_STATUS: Partial<Record<Role, Status>> = {
  im: "pending",
  ifo: "traveling",
  fo: "with_fo",
  rig: "with_rig",
};
// Cards an IM can take back into stock.
const RECEIVABLE = new Set<Status>(["pending", "traveling", "with_fo", "with_rig", "with_internal"]);

const hubName = (ctx: HandoverContext, id: string) => ctx.hubs.find((h) => h.hub_id === id)?.name ?? id;

const list = (ids: string[]) => (ids.length > 5 ? `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more` : ids.join(", "));

// Every event is stamped with the moment it is saved. There is no way to enter a different time.
function eventBase(ctx: HandoverContext, note: string) {
  return {
    batch_id: ctx.newId("b"),
    occurred_at: ctx.now,
    recorded_at: ctx.now,
    recorded_by: ctx.by,
    note,
  };
}

/**
 * Send in-stock cards to a person AT a location. Both are always required. The person decides the status
 * (IM = pending, IFO = traveling, FO = with FO, rig = with rig, a typed "Internal" name = with internal).
 * The location is where the cards are recorded, whichever hub the person normally belongs to.
 */
export function planSend(targets: Item[], input: SendInput, ctx: HandoverContext): HandoverPlan {
  const plan: HandoverPlan = { events: [], items: [], errors: [] };
  const activeHub = (id: string) => ctx.hubs.some((h) => h.hub_id === id && h.active !== "false");

  // A typed "Internal" name has no row in People, so it's used as-is for the holder and the display
  // name falls back to it automatically (see displayName). Otherwise the recipient must be a real,
  // active person whose role has a status.
  const internalName = (input.internalName ?? "").trim();
  let status: Status | undefined;
  let holder = "";
  if (internalName) {
    status = "with_internal";
    holder = internalName;
  } else {
    const recipient = ctx.people.find((p) => p.person_id === input.recipient && p.active !== "false");
    status = recipient && SEND_STATUS[recipient.role];
    holder = recipient?.person_id ?? "";
    if (!recipient || !status) plan.errors.push("Choose the person the items are going to.");
  }
  if (!activeHub(input.toHub)) plan.errors.push("Choose the location the items are going to.");

  if (!activeHub(input.fromHub)) {
    plan.errors.push("Choose the hub you are sending from.");
  }
  const notInStock = targets.filter((t) => t.status !== "in_stock").map((t) => `${t.item_id} (${t.status})`);
  if (notInStock.length) plan.errors.push(`Only in-stock items can be sent. Not in stock: ${list(notInStock)}.`);

  // Sending from a hub means the cards are in stock there. Choosing the right hub is the fix if they are not.
  const elsewhere = targets.filter((t) => t.status === "in_stock" && t.current_hub !== input.fromHub);
  if (elsewhere.length && plan.errors.length === 0) {
    plan.errors.push(
      `Not at ${hubName(ctx, input.fromHub)}: ${list(elsewhere.map((t) => `${t.item_id} (at ${hubName(ctx, t.current_hub)})`))}. Choose that hub in "Sending from".`,
    );
  }
  if (plan.errors.length || !status) return plan;

  const base = eventBase(ctx, input.note.trim());
  for (const item of targets) {
    const hub = input.toHub;
    const event: ItemEvent = {
      ...base,
      event_id: ctx.newId("e"),
      item_id: item.item_id,
      action: "check_out",
      from_person: displayName(ctx.people, ctx.actorPersonId),
      to_person: displayName(ctx.people, holder),
      from_id: ctx.actorPersonId,
      to_id: holder,
      from_hub: input.fromHub,
      hub,
      status_after: status,
    };
    plan.events.push(event);
    plan.items.push({
      ...item,
      status,
      current_hub: hub,
      current_holder: holder,
      last_event_id: event.event_id,
      updated_at: ctx.now,
    });
  }
  return plan;
}

/** An IM takes cards back into stock at a hub. `expected` (optional) flags a count mismatch. */
export function planReceive(
  targets: Item[],
  input: { hub: string; note: string; expected?: number },
  ctx: HandoverContext,
): HandoverPlan {
  const plan: HandoverPlan = { events: [], items: [], errors: [] };
  if (!ctx.hubs.some((h) => h.hub_id === input.hub && h.active !== "false")) plan.errors.push("Choose the receiving hub.");
  const wrong = targets.filter((t) => !RECEIVABLE.has(t.status)).map((t) => `${t.item_id} (${t.status})`);
  if (wrong.length) plan.errors.push(`These items are not waiting to be received: ${list(wrong)}.`);

  // A card sent to a hub must be received at that hub, otherwise it could silently land in the wrong stock
  // (e.g. 50 sent, only 40 ever show up received, with the other 10 unnoticed in the wrong place). This
  // applies to IM, IFO and the rig team - all hub-to-hub style movements. A card with an FO has no fixed
  // hub (an IM collects it back wherever that FO happens to be), and Internal needs no handshake at all,
  // so neither is locked to a hub.
  const HUB_LOCKED: ReadonlySet<Status> = new Set(["pending", "traveling", "with_rig"]);
  const elsewhere = targets.filter((t) => HUB_LOCKED.has(t.status) && t.current_hub !== input.hub);
  if (elsewhere.length) {
    plan.errors.push(
      `Sent to a different hub: ${list(elsewhere.map((t) => `${t.item_id} (to ${hubName(ctx, t.current_hub)})`))}. Receive them at that hub, not ${hubName(ctx, input.hub)}.`,
    );
  }
  if (plan.errors.length) return plan;

  if (input.expected !== undefined && input.expected !== targets.length) {
    plan.mismatch = `Mismatch: expected ${input.expected}, received ${targets.length}.`;
  }
  const note = [plan.mismatch, input.note.trim()].filter(Boolean).join(" ");
  const base = eventBase(ctx, note);
  for (const item of targets) {
    const event: ItemEvent = {
      ...base,
      event_id: ctx.newId("e"),
      item_id: item.item_id,
      action: "receive",
      from_person: displayName(ctx.people, item.current_holder),
      to_person: displayName(ctx.people, ctx.actorPersonId),
      from_id: item.current_holder,
      to_id: ctx.actorPersonId,
      from_hub: item.current_hub,
      hub: input.hub,
      status_after: "in_stock",
    };
    plan.events.push(event);
    plan.items.push({
      ...item,
      status: "in_stock",
      current_hub: input.hub,
      current_holder: "",
      last_event_id: event.event_id,
      updated_at: ctx.now,
    });
  }
  return plan;
}
