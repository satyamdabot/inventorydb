import type { Row, TabName } from "../schema";

// Minimal table operations. Google Sheets and the in-memory store implement this;
// a Postgres backend would implement the same four methods.
export interface TableBackend {
  /** Create missing tabs and write/extend header rows. */
  ensureTabs(): Promise<void>;
  readAll(tab: TabName): Promise<Row[]>;
  /** Append rows to the end of a tab. */
  append(tab: TabName, rows: Row[]): Promise<void>;
  /** Update rows whose key (first column) exists, append the rest. */
  upsert(tab: TabName, rows: Row[]): Promise<void>;
}
