import { TABS, type Row, type TabName } from "../schema";
import type { TableBackend } from "./backend";

// In-memory backend for development and tests. Data is lost on restart.
export class MemoryBackend implements TableBackend {
  private tabs = new Map<TabName, Row[]>();

  async ensureTabs() {
    for (const tab of Object.keys(TABS) as TabName[]) {
      if (!this.tabs.has(tab)) this.tabs.set(tab, []);
    }
  }

  async readAll(tab: TabName) {
    return (this.tabs.get(tab) ?? []).map((r) => ({ ...r }));
  }

  async append(tab: TabName, rows: Row[]) {
    const list = this.tabs.get(tab) ?? [];
    list.push(...rows.map((r) => ({ ...r })));
    this.tabs.set(tab, list);
  }

  async upsert(tab: TabName, rows: Row[]) {
    const key = TABS[tab][0];
    const list = this.tabs.get(tab) ?? [];
    const index = new Map(list.map((r, i) => [r[key], i]));
    for (const row of rows) {
      const at = index.get(row[key]);
      if (at === undefined) {
        index.set(row[key], list.length);
        list.push({ ...row });
      } else {
        list[at] = { ...row };
      }
    }
    this.tabs.set(tab, list);
  }
}
