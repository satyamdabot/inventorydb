import { findInconsistencies, type Inconsistency } from "./consistency";
import { istDate } from "./time";
import { OUT_STATUSES, STATUSES, type Hub, type Item, type ItemEvent, type Person, type Role, type Status } from "./schema";

export interface DashboardOptions {
  hub: string; // hub_id to scope current-state numbers to, "" for all hubs
  days: number; // length of the activity window
  now: Date;
}

export interface HubRow {
  hub_id: string;
  name: string;
  owned: number;
  held: number;
  inStock: number;
  out: number;
  byStatus: Record<Status, number>; // what the cards held here are doing
}
export interface HolderRow {
  person_id: string;
  name: string;
  role: Role | "";
  count: number;
  oldestDays: number | null;
}
export interface PendingRow {
  hub_id: string;
  name: string;
  count: number;
  oldestDays: number | null;
}
export interface AgingRow {
  item_id: string;
  status: Status;
  holder: string;
  hub: string;
  days: number | null;
}
export interface ActivityDay {
  date: string; // YYYY-MM-DD (UTC)
  sent: number;
  received: number;
  corrected: number;
}
export interface Dashboard {
  total: number;
  byStatus: Record<Status, number>;
  outCount: number;
  avgDaysOut: number | null;
  hubs: HubRow[];
  holders: HolderRow[];
  pending: PendingRow[];
  longestOut: AgingRow[];
  activity: ActivityDay[];
  noHistory: number;
  inconsistencies: Inconsistency[];
}

const DAY = 86_400_000;
// Days are India days: an event at 11 pm IST counts on that day, not the next UTC day.
const dateKey = istDate;
const oldest = (days: (number | null)[]) => days.reduce<number | null>((m, d) => (d === null ? m : m === null || d > m ? d : m), null);

/** All dashboard numbers, computed from the sheet rows. Pure, so it can be tested without a browser. */
export function computeDashboard(
  items: Item[],
  events: ItemEvent[],
  people: Person[],
  hubs: Hub[],
  opts: DashboardOptions,
): Dashboard {
  const scoped = opts.hub ? items.filter((i) => i.current_hub === opts.hub) : items;
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const personById = new Map(people.map((p) => [p.person_id, p]));

  // Most recent event time per card, used for "how long has it been out".
  const lastAt = new Map<string, number>();
  for (const e of events) {
    const t = Date.parse(e.occurred_at);
    if (!Number.isNaN(t) && t > (lastAt.get(e.item_id) ?? -Infinity)) lastAt.set(e.item_id, t);
  }
  const ageDays = (item: Item): number | null => {
    const t = lastAt.get(item.item_id) ?? Date.parse(item.updated_at);
    return Number.isNaN(t) ? null : Math.max(0, Math.floor((opts.now.getTime() - t) / DAY));
  };

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const i of scoped) if (i.status in byStatus) byStatus[i.status]++;

  const out = scoped.filter((i) => OUT_STATUSES.includes(i.status));
  const outAges = out.map(ageDays).filter((d): d is number => d !== null);

  const hubRows: HubRow[] = hubs
    .map((h) => {
      const held = items.filter((i) => i.current_hub === h.hub_id);
      return {
        hub_id: h.hub_id,
        name: h.name,
        owned: items.filter((i) => i.home_hub === h.hub_id).length,
        held: held.length,
        inStock: held.filter((i) => i.status === "in_stock").length,
        out: held.filter((i) => OUT_STATUSES.includes(i.status)).length,
        byStatus: Object.fromEntries(STATUSES.map((s) => [s, held.filter((i) => i.status === s).length])) as Record<Status, number>,
      };
    })
    .filter((r) => r.owned > 0 || r.held > 0)
    .sort((a, b) => b.held - a.held || a.name.localeCompare(b.name));

  const holderMap = new Map<string, Item[]>();
  for (const i of out) holderMap.set(i.current_holder, [...(holderMap.get(i.current_holder) ?? []), i]);
  const holders: HolderRow[] = [...holderMap.entries()]
    .map(([id, list]) => ({
      person_id: id,
      name: personById.get(id)?.name ?? (id || "Unknown"),
      role: personById.get(id)?.role ?? ("" as const),
      count: list.length,
      oldestDays: oldest(list.map(ageDays)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const pendingMap = new Map<string, Item[]>();
  for (const i of scoped.filter((x) => x.status === "pending")) {
    pendingMap.set(i.current_hub, [...(pendingMap.get(i.current_hub) ?? []), i]);
  }
  const pending: PendingRow[] = [...pendingMap.entries()]
    .map(([id, list]) => ({
      hub_id: id,
      name: hubName.get(id) ?? id,
      count: list.length,
      oldestDays: oldest(list.map(ageDays)),
    }))
    .sort((a, b) => b.count - a.count);

  const longestOut: AgingRow[] = out
    .map((i) => ({
      item_id: i.item_id,
      status: i.status,
      holder: personById.get(i.current_holder)?.name ?? i.current_holder,
      hub: hubName.get(i.current_hub) ?? i.current_hub,
      days: ageDays(i),
    }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
    .slice(0, 15);

  // One bucket per day for the window, oldest first, so quiet days show as gaps in the chart.
  const activity: ActivityDay[] = [];
  const index = new Map<string, ActivityDay>();
  for (let n = opts.days - 1; n >= 0; n--) {
    const day = { date: dateKey(new Date(opts.now.getTime() - n * DAY)), sent: 0, received: 0, corrected: 0 };
    activity.push(day);
    index.set(day.date, day);
  }
  for (const e of events) {
    if (opts.hub && e.hub !== opts.hub) continue;
    const at = Date.parse(e.occurred_at);
    const day = Number.isNaN(at) ? undefined : index.get(dateKey(new Date(at)));
    if (!day) continue;
    if (e.action === "check_out") day.sent++;
    else if (e.action === "receive") day.received++;
    else if (e.action === "correct" || e.action === "reassign_home_hub") day.corrected++;
  }

  const withEvents = new Set(events.map((e) => e.item_id));
  return {
    total: scoped.length,
    byStatus,
    outCount: out.length,
    avgDaysOut: outAges.length ? outAges.reduce((a, b) => a + b, 0) / outAges.length : null,
    hubs: hubRows,
    holders,
    pending,
    longestOut,
    activity,
    noHistory: scoped.filter((i) => !withEvents.has(i.item_id)).length,
    inconsistencies: findInconsistencies(items, events),
  };
}
