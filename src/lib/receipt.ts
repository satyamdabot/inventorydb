import type { Action, Hub, Item, ItemEvent, Status } from "./schema";

export interface ReceiptLine {
  cardType: string;
  [x: string]: string;
  prismNo: string;
  storage: string;
  itemId: string;
  brand: string;
  model: string;

  // Original item price, as stored.
  price: string;

  statusAfter: Status;

  // Manually supplied penalty for this item, in rupees.
  penalty: number;
  penaltyReason: string;
}

export interface BatchSummary {
  recordedBy: string;
  recordedBy: any;
  batchId: string;
  action: Action;
  occurredAt: string;
  fromName: string;
  toName: string;
  hubId: string;
  hubName: string;
  note: string;
  items: ReceiptLine[];

  // Item value only. This is not a charge or penalty.
  totalPrice: number | null;

  // Penalties are kept separate from item value.
  totalPenalty: number;
}

export interface ItemPenalty {
  amount: number;
  reason: string;
}

// Pass penalties for the requested batch, keyed by item ID.
// Missing entries have zero penalty.
export type PenaltiesByItem = Readonly<
  Record<string, ItemPenalty | undefined>
>;

/**
 * Format a stored item price in rupees.
 * Blank or invalid prices display as an empty string.
 */
export function formatPrice(raw: string): string {
  const n = Number(raw);

  if (raw.trim() === "" || !Number.isFinite(n)) {
    return "";
  }

  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a penalty in rupees.
 * Zero is displayed explicitly.
 */
export function formatPenalty(amount: number): string {
  return `₹${validatePenaltyAmount(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parsePrice(raw: string): number | undefined {
  const n = Number(raw);

  return raw.trim() !== "" && Number.isFinite(n)
    ? n
    : undefined;
}

/**
 * Reject invalid amounts rather than silently changing them.
 * Amounts are rounded to the nearest paise.
 */
function validatePenaltyAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(
      "Penalty must be a finite number greater than or equal to zero."
    );
  }

  const paise = Math.round(amount * 100);

  if (!Number.isSafeInteger(paise)) {
    throw new Error("Penalty amount is too large.");
  }

  return paise / 100;
}

/**
 * Extract the batch ID from a receipt URL or a plain ID.
 * Removes query strings, fragments and trailing slashes.
 */
export function extractBatchId(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  const withoutQuery = trimmed.split(/[#?]/, 1)[0];
  const withoutSlash = withoutQuery.replace(/\/+$/, "");
  const parts = withoutSlash.split("/");

  return parts[parts.length - 1];
}

/**
 * Summarize one batch handover.
 *
 * The optional fifth argument supplies penalties for this batch.
 * Existing calls with four arguments continue to work, with
 * every penalty defaulting to zero.
 *
 * This function calculates a summary only.
 * It does not save penalties or collect payments.
 */
export function summarizeBatch(
  events: ItemEvent[],
  items: Item[],
  hubs: Hub[],
  batchId: string,
  penaltiesByItem: PenaltiesByItem = {},
): BatchSummary | undefined {
  if (!batchId) {
    return undefined;
  }

  const rows = events.filter((e) => e.batch_id === batchId);

  if (rows.length === 0) {
    return undefined;
  }

  const first = rows[0];

  const itemById = new Map(
    items.map((i) => [i.item_id, i])
  );

  const hubName =
    hubs.find((h) => h.hub_id === first.hub)?.name ??
    first.hub;

  // Prevent duplicate event rows from applying the same
  // item-level penalty more than once within the batch.
  const penaltyApplied = new Set<string>();

  const lines: ReceiptLine[] = rows
    .map((r) => {
      const item = itemById.get(r.item_id);

      const configuredPenalty = Object.prototype.hasOwnProperty.call(
        penaltiesByItem,
        r.item_id
      )
        ? penaltiesByItem[r.item_id]
        : undefined;

      const applyPenalty =
        configuredPenalty !== undefined &&
        !penaltyApplied.has(r.item_id);

      const penalty = applyPenalty
        ? validatePenaltyAmount(configuredPenalty.amount)
        : 0;

      const penaltyReason = applyPenalty
        ? configuredPenalty.reason.trim()
        : "";

      if (penalty > 0 && !penaltyReason) {
        throw new Error(
          `A penalty reason is required for item ${r.item_id}.`
        );
      }

      if (applyPenalty) {
        penaltyApplied.add(r.item_id);
      }

      return {
        itemId: r.item_id,
        brand: item?.brand ?? "",
        model: item?.model ?? "",
        price: item?.price ?? "",
        statusAfter: r.status_after,
        penalty,
        penaltyReason,
      };
    })
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  const prices = lines
    .map((line) => parsePrice(line.price))
    .filter((n): n is number => n !== undefined);

  // Sum in paise to avoid ordinary decimal rounding artifacts.
  const totalPenaltyPaise = lines.reduce(
    (sum, line) => sum + Math.round(line.penalty * 100),
    0
  );

  if (!Number.isSafeInteger(totalPenaltyPaise)) {
    throw new Error("Total penalty amount is too large.");
  }

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

    totalPrice: prices.length
      ? prices.reduce((sum, price) => sum + price, 0)
      : null,

    totalPenalty: totalPenaltyPaise / 100,
  };
}