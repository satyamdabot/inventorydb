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

  /**
   * Looks up cards by the codes that were typed or scanned, ignoring letter case (a scanner with Caps Lock
   * on types capitals as lowercase). The map is keyed by the code as requested and holds the stored card,
   * so callers must use `item.item_id`, not the requested code. Missing codes are absent from the map.
   */
  async getItemsByIds(ids: string[]) {
    const items = await this.list("items");
    const exact = new Map(items.map((i) => [i.item_id, i]));
    const byUpper = new Map<string, Item>();
    for (const i of items) if (!byUpper.has(i.item_id.toUpperCase())) byUpper.set(i.item_id.toUpperCase(), i);

    const found = new Map<string, Item>();
    for (const id of ids) {
      const item = exact.get(id) ?? byUpper.get(id.toUpperCase());
      if (item) found.set(id, item);
    }
    return found;
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
