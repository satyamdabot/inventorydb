import { OUT_STATUSES, type Item, type ItemEvent } from "./schema";

const DAY = 86_400_000;

export function computeMyStats(items: Item[], events: ItemEvent[], me: string, now: Date, days = 30) {
  const since = now.getTime() - days * DAY;
  const recent = events.filter((e) => Date.parse(e.occurred_at) >= since);

  // Work done in the period
  const sent = recent.filter((e) => e.action === "check_out" && e.from_id === me).length;
  const received = recent.filter((e) => e.action === "receive" && e.to_id === me).length;

  // Cards in my name right now (e.g. a rig member's cards, or cards waiting for this IM)
  const holding = items.filter((i) => i.current_holder === me && OUT_STATUSES.includes(i.status));

  // Cards I sent out that haven't come back yet (their latest event is my send)
  const eventById = new Map(events.map((e) => [e.event_id, e]));
  const sentStillOut = items.filter((i) => {
    const last = eventById.get(i.last_event_id);
    return last?.action === "check_out" && last.from_id === me;
  });
  const sentOutByStatus = Object.groupBy(sentStillOut, (i) => i.status); // with_rig, with_fo, traveling...

  return { sent, received, holding, sentStillOut, sentOutByStatus };
}