import { findInconsistencies, type Inconsistency } from "../consistency";
import type { Item, ItemEvent, Row, TabName, TabRows } from "../schema";
import type { TableBackend } from "./backend";

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
    // By instant, not by text, so old UTC rows and IST rows sort together correctly.
    return events.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
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

  async checkConsistency(): Promise<Inconsistency[]> {
    const [items, events] = await Promise.all([this.list("items"), this.list("events")]);
    return findInconsistencies(items, events);
  }
}
