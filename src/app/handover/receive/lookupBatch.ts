"use server";

import { requireRole } from "@/lib/authz";
import { extractBatchId, summarizeBatch } from "@/lib/receipt";
import { getStore } from "@/lib/store";
import { formatIst } from "@/lib/time";

export interface BatchLookupResult {
  ok: boolean;
  message: string;
  ids: string[];
}

/**
 * Resolves a scanned or pasted batch receipt (its QR encodes the receipt's own URL) to the cards in it,
 * so they can be loaded into the scan box in one go instead of scanning each one again. Returns data
 * directly rather than redirecting, so it can be called from a client component without a page reload.
 */
export async function lookupBatch(raw: string): Promise<BatchLookupResult> {
  await requireRole("admin", "im");
  const batchId = extractBatchId(raw);
  if (!batchId) return { ok: false, message: "Scan or paste a batch receipt first.", ids: [] };

  const store = getStore();
  const [events, items, hubs] = await Promise.all([store.list("events"), store.list("items"), store.list("hubs")]);
  const summary = summarizeBatch(events, items, hubs, batchId);
  if (!summary) return { ok: false, message: `No batch found for "${batchId}".`, ids: [] };

  const who =
    summary.action === "check_out"
      ? `sent by ${summary.fromName || "someone"} to ${summary.toName || "—"}`
      : `${summary.fromName || "—"} → ${summary.toName || "someone"}`;
  const count = summary.items.length;
  return {
    ok: true,
    message: `Batch ${summary.batchId}: ${count} card${count === 1 ? "" : "s"}, ${who}, at ${summary.hubName}, ${formatIst(summary.occurredAt)} IST.`,
    ids: summary.items.map((i) => i.itemId),
  };
}
