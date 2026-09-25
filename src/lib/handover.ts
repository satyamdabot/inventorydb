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

export interface SendInput {
  recipient?: string; // person_id when handing to a person
  toHub?: string; // hub_id when sending to a hub with no named person
  note: string;
  checkoutDate?: string; // YYYY-MM-DD, defaults to today
  expectedReturn?: string; // YYYY-MM-DD, optional
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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s));

const list = (ids: string[]) => (ids.length > 5 ? `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more` : ids.join(", "));

function eventBase(ctx: HandoverContext, note: string, occurredAt: string, expectedReturn: string) {
  return {
    batch_id: ctx.newId("b"),
    occurred_at: occurredAt,
    recorded_at: ctx.now,
    recorded_by: ctx.by,
    note,
    expected_return: expectedReturn,
  };
}

/**
 * Send in-stock cards to a person (IM = pending, IFO = traveling, FO = with FO, rig = with rig)
 * or to a hub with no named person (pending at that hub, any IM there can receive).
 */
export function planSend(targets: Item[], input: SendInput, ctx: HandoverContext): HandoverPlan {
  const plan: HandoverPlan = { events: [], items: [], errors: [] };
  const today = ctx.now.slice(0, 10);

  const checkout = input.checkoutDate || today;
  if (!validDate(checkout)) plan.errors.push("Enter a valid checkout date.");
  else if (checkout > today) plan.errors.push("The checkout date can't be in the future.");
  const expected = input.expectedReturn || "";
  if (expected) {
    if (!validDate(expected)) plan.errors.push("Enter a valid expected check-in date.");
    else if (validDate(checkout) && expected < checkout) plan.errors.push("The expected check-in date can't be before the checkout date.");
  }

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

  const notInStock = targets.filter((t) => t.status !== "in_stock").map((t) => `${t.item_id} (${t.status})`);
  if (notInStock.length) plan.errors.push(`Only in-stock cards can be sent. Not in stock: ${list(notInStock)}.`);
  if (plan.errors.length || !status) return plan;

  // The chosen date keeps today's time of day, so events on the same date still sort in the order they happened.
  const base = eventBase(ctx, input.note.trim(), `${checkout}T${ctx.now.slice(11)}`, expected);
  for (const item of targets) {
    const hub = fixedHub || item.current_hub;
    const event: ItemEvent = {
      ...base,
      event_id: ctx.newId("e"),
      item_id: item.item_id,
      action: "check_out",
      from_person: ctx.actorPersonId,
      to_person: holder,
      hub,
      status_after: status,
    };
    plan.events.push(event);
    plan.items.push({
      ...item,
      status,
      current_hub: hub,
      current_holder: holder,
      expected_return: expected,
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
  const base = eventBase(ctx, note, ctx.now, "");
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
      expected_return: "",
      last_event_id: event.event_id,
      updated_at: ctx.now,
    });
  }
  return plan;
}
