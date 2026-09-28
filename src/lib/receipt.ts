import type { Action, Hub, Item, ItemEvent, Status } from "./schema";

export interface ReceiptLine {
  itemId: string;
  brand: string;
  model: string;
  prismNo: string;
  statusAfter: Status;
}

export interface BatchSummary {
  batchId: string;
  action: Action;
  occurredAt: string; // IST, as stored
  fromName: string;
  toName: string;
  hubId: string;
  hubName: string;
  note: string;
  items: ReceiptLine[];
}

/**
 * The batch id from whatever was scanned or pasted: the receipt's own QR (a full URL ending in the id),
 * or the id typed or scanned on its own. Trims whitespace and a trailing slash either way.
 */
export function extractBatchId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  const withoutSlash = withoutQuery.replace(/\/+$/, "");
  const parts = withoutSlash.split("/");
  return parts[parts.length - 1];
}

/**
 * Everything about one batch handover: who, where, when, and every card in it with its details. All rows
 * of one batch share the same action, time, sender, recipient, hub and note, so the first row stands for
 * the batch and the rest just contribute their item. Undefined when the batch id matches no event.
 */
export function summarizeBatch(
  events: ItemEvent[],
  items: Item[],
  hubs: Hub[],
  batchId: string,
): BatchSummary | undefined {
  if (!batchId) return undefined;
  const rows = events.filter((e) => e.batch_id === batchId);
  if (rows.length === 0) return undefined;

  const first = rows[0];
  const itemById = new Map(items.map((i) => [i.item_id, i]));
  const hubName = hubs.find((h) => h.hub_id === first.hub)?.name ?? first.hub;

  const lines: ReceiptLine[] = rows
    .map((r) => {
      const item = itemById.get(r.item_id);
      return {
        itemId: r.item_id,
        brand: item?.brand ?? "",
        model: item?.model ?? "",
        prismNo: item?.prism_no ?? "",
        statusAfter: r.status_after,
      };
    })
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  return {
    batchId,
    action: first.action,
    occurredAt: first.occurred_at,
    fromName: first.from_person,
    toName: first.to_person,
    hubId: first.hub,
    hubName,
    note: first.note,
    items: lines,
  };
}
