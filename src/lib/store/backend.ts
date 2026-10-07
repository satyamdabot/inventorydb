import type { Row, TabName } from "../schema";

export interface DeleteItemResult {
  deletedItems: number;
  deletedEvents: number;
}

// Operations implemented by each storage backend.
export interface TableBackend {
  /** Create missing tabs and write/extend header rows. */
  ensureTabs(): Promise<void>;

  /** Read all records in a tab. */
  readAll(tab: TabName): Promise<Row[]>;

  /** Append records to the end of a tab. */
  append(tab: TabName, rows: Row[]): Promise<void>;

  /** Update existing records and append new records. */
  upsert(tab: TabName, rows: Row[]): Promise<void>;

  /**
   * Permanently remove one item and its associated events.
   * Optional because not every backend implements deletion.
   */
  deleteItemAndHistory?(
    itemId: string
  ): Promise<DeleteItemResult>;
}