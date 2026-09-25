import type { Hub, Item, ItemEvent, Person, Role, Status } from "./schema";

export interface HandoverContext {
  hubs: Hub[];
  people: Person[];
  actorPersonId: string; // the signed-in IM's linked person, "" for an admin with none
  by: string; // signed-in email
  now: string;
  newId: (prefix: string) => string;
}

export interface HandoverPlan {
  events: ItemEvent[];
  items: Item[];
  errors: string[];
  mismatch?: string;
}

// What a card becomes when an IM hands it to someone of each role.
const SEND_STATUS: Partial<Record<Role, Status>> = {
  im: "pending",
  ifo: "traveling",
  fo: "with_fo",
  rig: "with_rig",
};
// Where the card is once handed over. A traveling card stays at the hub it left.
const HUB_FROM_RECIPIENT = new Set<Status>(["pending", "with_fo", "with_rig"]);

// Cards an IM can take back into stock.
const RECEIVABLE = new Set<Status>(["pending", "traveling", "with_fo", "with_rig"]);

const list = (ids: string[]) => (ids.length > 5 ? `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more` : ids.join(", "));

function eventBase(ctx: HandoverContext, note: string) {
  return { batch_id: ctx.newId("b"), occurred_at: ctx.now, recorded_at: ctx.now, recorded_by: ctx.by, note };
}

/** Send cards from stock to an IM (pending), IFO (traveling), FO (with FO) or rig team (with rig). */
export function planSend(
  targets: Item[],
  input: { recipient: string; note: string },
  ctx: HandoverContext,
): HandoverPlan {
  const plan: HandoverPlan = { events: [], items: [], errors: [] };
  const recipient = ctx.people.find((p) => p.person_id === input.recipient && p.active !== "false");
  const status = recipient && SEND_STATUS[recipient.role];
  if (!recipient || !status) {
    plan.errors.push("Choose who the cards are going to.");
    return plan;
  }
  const notInStock = targets.filter((t) => t.status !== "in_stock").map((t) => `${t.item_id} (${t.status})`);
  if (notInStock.length) plan.errors.push(`Only in-stock cards can be sent. Not in stock: ${list(notInStock)}.`);
  if (plan.errors.length) return plan;

  const base = eventBase(ctx, input.note.trim());
  for (const item of targets) {
    const hub = HUB_FROM_RECIPIENT.has(status) ? recipient.hub : item.current_hub;
    const event: ItemEvent = {
      ...base,
      event_id: ctx.newId("e"),
      item_id: item.item_id,
      action: "check_out",
      from_person: ctx.actorPersonId,
      to_person: recipient.person_id,
      hub,
      status_after: status,
    };
    plan.events.push(event);
    plan.items.push({
      ...item,
      status,
      current_hub: hub,
      current_holder: recipient.person_id,
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
      from_person: item.current_holder,
      to_person: ctx.actorPersonId,
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
