import {
  findInconsistencies,
  type Inconsistency,
} from "../consistency";
import type {
  Item,
  ItemEvent,
  Row,
  TabName,
  TabRows,
} from "../schema";
import type {
  DeleteItemResult,
  TableBackend,
} from "./backend";

export class Store {
  constructor(private backend: TableBackend) {}

  init() {
    return this.backend.ensureTabs();
  }

  async list<T extends TabName>(
    tab: T
  ): Promise<TabRows[T][]> {
    return (
      await this.backend.readAll(tab)
    ) as unknown as TabRows[T][];
  }

  upsert<T extends TabName>(
    tab: T,
    rows: Partial<TabRows[T]>[]
  ) {
    return this.backend.upsert(tab, rows as Row[]);
  }

  async getItem(itemId: string) {
    return (await this.list("items")).find(
      (item) => item.item_id === itemId
    );
  }

  /**
   * Look up scanned/typed IDs, ignoring letter case.
   * Return a map keyed by the requested IDs.
   */
  async getItemsByIds(ids: string[]) {
    const items = await this.list("items");

    const exact = new Map(
      items.map((item) => [item.item_id, item])
    );

    const byUpper = new Map<string, Item>();

    for (const item of items) {
      const upper = item.item_id.toUpperCase();

      if (!byUpper.has(upper)) {
        byUpper.set(upper, item);
      }
    }

    const found = new Map<string, Item>();

    for (const id of ids) {
      const item =
        exact.get(id) ?? byUpper.get(id.toUpperCase());

      if (item) {
        found.set(id, item);
      }
    }

    return found;
  }

  async getHistory(itemId: string) {
    const events = (await this.list("events")).filter(
      (event) => event.item_id === itemId
    );

    return events.sort(
      (a, b) =>
        Date.parse(a.occurred_at) -
        Date.parse(b.occurred_at)
    );
  }

  /**
   * Save events first, then the derived item records.
   */
  async commitBatch(
    events: ItemEvent[],
    items: Item[]
  ) {
    await this.backend.append("events", events);
    await this.backend.upsert("items", items);
  }

  async checkConsistency(): Promise<Inconsistency[]> {
    const [items, events] = await Promise.all([
      this.list("items"),
      this.list("events"),
    ]);

    return findInconsistencies(items, events);
  }

    /**
   * Record a permanent deletion in the "deletions" tab.
   * Creates the tab the first time it is needed.
   */
  async logDeletion(row: TabRows["deletions"]) {
    try {
      await this.backend.append("deletions", [row]);
    } catch {
      await this.backend.ensureTabs();
      await this.backend.append("deletions", [row]);
    }
  }
  
  /**
   * Record an admin edit to a past receipt in the "receipt_edits" tab.
   * Creates the tab the first time it is needed.
   */
  async logReceiptEdit(row: TabRows["receipt_edits"]) {
    try {
      await this.backend.append("receipt_edits", [row]);
    } catch {
      await this.backend.ensureTabs();
      await this.backend.append("receipt_edits", [row]);
    }
  }

  /**
   * Permanent deletion.
   * The calling server action must enforce Admin authorization.
   */
  async deleteItemAndHistory(
    itemId: string
  ): Promise<DeleteItemResult> {
    const id = itemId.trim();

    if (!id) {
      throw new Error("An item ID is required.");
    }

    if (!this.backend.deleteItemAndHistory) {
      throw new Error(
        "Permanent deletion is not supported by the active storage backend."
      );
    }

    return this.backend.deleteItemAndHistory(id);
  }
}