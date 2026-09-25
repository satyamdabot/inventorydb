import type { Item, ItemEvent, Row, TabName, TabRows } from "../schema";
import type { TableBackend } from "./backend";

export interface Inconsistency {
  item_id: string;
  reason: string;
}

// All app data access goes through this class. Swapping Sheets for Postgres
// means providing a different TableBackend, nothing else changes.
export class Store {
  constructor(private backend: TableBackend) {}

  init() {
    return this.backend.ensureTabs();
  }

  async list<T extends TabName>(tab: T): Promise<TabRows[T][]> {
    return (await this.backend.readAll(tab)) as unknown as TabRows[T][];
  }

  upsert<T extends TabName>(tab: T, rows: Partial<TabRows[T]>[]) {
    return this.backend.upsert(tab, rows as Row[]);
  }

  async getItem(itemId: string) {
    return (await this.list("items")).find((i) => i.item_id === itemId);
  }

  /** Returns a map of the requested ids that exist. Missing ids are absent from the map. */
  async getItemsByIds(ids: string[]) {
    const wanted = new Set(ids);
    const found = (await this.list("items")).filter((i) => wanted.has(i.item_id));
    return new Map(found.map((i) => [i.item_id, i]));
  }

  async getHistory(itemId: string) {
    const events = (await this.list("events")).filter((e) => e.item_id === itemId);
    return events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  }

  /**
   * Save one handover. Events are written first (source of truth), then the
   * derived item rows. If the second step fails the items are stale, which
   * checkConsistency() detects.
   */
  async commitBatch(events: ItemEvent[], items: Item[]) {
    await this.backend.append("events", events);
    await this.backend.upsert("items", items);
  }

  /** Flags items whose stored status/last event differs from their latest event. */
  async checkConsistency(): Promise<Inconsistency[]> {
    const [items, events] = await Promise.all([this.list("items"), this.list("events")]);
    const latest = new Map<string, ItemEvent>();
    for (const e of events) latest.set(e.item_id, e); // events are appended in order
    const problems: Inconsistency[] = [];
    for (const item of items) {
      const last = latest.get(item.item_id);
      if (!last) continue; // item with no events yet (e.g. freshly imported)
      if (item.last_event_id !== last.event_id) {
        problems.push({ item_id: item.item_id, reason: "items row is behind the latest event" });
      } else if (item.status !== last.status_after) {
        problems.push({ item_id: item.item_id, reason: "status differs from latest event" });
      }
    }
    return problems;
  }
}
