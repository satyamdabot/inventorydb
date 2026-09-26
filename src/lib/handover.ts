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
  recipient?: string; // person_id when handing to a person
  toHub?: string; // hub_id when sending to a hub with no named person
  note: string;
}

// What a card becomes when an IM hands it to someone of each role.
const SEND_STATUS: Partial<Record<Role, Status>> = {
  im: "pending",
  ifo: "traveling",
  fo: "with_fo",
  rig: "with_rig",
};
// Only a card sent to an IM moves to the recipient's hub (it is going there). A card handed to an IFO, FO or
// rig team member stays at the hub it was sent from, whichever hub that person belongs to.
const HUB_FROM_RECIPIENT = new Set<Status>(["pending"]);

// Cards an IM can take back into stock.
const RECEIVABLE = new Set<Status>(["pending", "traveling", "with_fo", "with_rig"]);

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
 * Send in-stock cards to a person (IM = pending, IFO = traveling, FO = with FO, rig = with rig)
 * or to a hub with no named person (pending at that hub, any IM there can receive).
 */
export function planSend(targets: Item[], input: SendInput, ctx: HandoverContext): HandoverPlan {
  const plan: HandoverPlan = { events: [], items: [], errors: [] };

  let status: Status | undefined;
  let holder = "";
  let fixedHub = "";
  if (input.toHub) {
    if (ctx.hubs.some((h) => h.hub_id === input.toHub && h.active !== "false")) {
      status = "pending";
      fixedHub = input.toHub;
    } else plan.errors.push("Choose an active hub.");
  } else {
    const recipient = ctx.people.find((p) => p.person_id === input.recipient && p.active !== "false");
    status = recipient && SEND_STATUS[recipient.role];
    if (recipient && status) {
      holder = recipient.person_id;
      fixedHub = HUB_FROM_RECIPIENT.has(status) ? recipient.hub : "";
    } else plan.errors.push("Choose who or where the cards are going.");
  }

  if (!ctx.hubs.some((h) => h.hub_id === input.fromHub && h.active !== "false")) {
    plan.errors.push("Choose the hub you are sending from.");
  }
  const notInStock = targets.filter((t) => t.status !== "in_stock").map((t) => `${t.item_id} (${t.status})`);
  if (notInStock.length) plan.errors.push(`Only in-stock cards can be sent. Not in stock: ${list(notInStock)}.`);

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
    const hub = fixedHub || item.current_hub;
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
  if (wrong.length) plan.errors.push(`These cards are not waiting to be received: ${list(wrong)}.`);

  // A card sent to a hub must be received at that hub, otherwise it would silently land in the wrong stock.
  // (Cards coming back from an IFO, FO or rig team have no fixed hub, so the receiver's hub is used.)
  const elsewhere = targets.filter((t) => t.status === "pending" && t.current_hub !== input.hub);
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
