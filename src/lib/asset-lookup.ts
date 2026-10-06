/** A reference asset-sheet row, matched by Asset Tag. */
export interface AssetRecord {
  itemId: string;
  brand: string;
  model: string;
  prismNo: string;
  price: string;
  capacity?: string;
  cardType?: string;
}

/** Convert a valid rupee amount to a plain numeric string. */
export function cleanPrice(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/₹/g, "")
    .replace(/\bINR\b/gi, "")
    .replace(/[,\s]/g, "");

  if (!cleaned) return "";
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return "";

  const amount = Number(cleaned);
  return Number.isFinite(amount) ? cleaned : "";
}

export function normalizeCapacity(raw: string): string {
  const value = raw.trim().replace(/\s+/g, "").toUpperCase();

  if (value === "512" || value === "512GB") return "512 GB";
  if (value === "256" || value === "256GB") return "256 GB";

  return "";
}

export function normalizeCardType(raw: string): string {
  const value = raw.trim().toLowerCase();

  if (value === "black") return "Black";
  if (value === "green") return "Green";

  return "";
}

function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Supports your original A:I layout when headers are not passed.
 * When headers are passed, column names determine the mapping.
 * Colour is never guessed from brand or model.
 */
export function parseAssetRow(
  row: string[],
  tabCapacity = "",
  headers: string[] = [],
): AssetRecord | null {
  const normalizedHeaders = headers.map(normalizeHeader);

  function cell(aliases: string[], legacyIndex?: number): string {
    if (headers.length > 0) {
      for (const alias of aliases) {
        const index = normalizedHeaders.indexOf(normalizeHeader(alias));

        if (index >= 0) {
          return String(row[index] ?? "").trim();
        }
      }

      return "";
    }

    return legacyIndex === undefined
      ? ""
      : String(row[legacyIndex] ?? "").trim();
  }

  const itemId = cell(["Asset Tag"], 0);
  if (!itemId) return null;

  return {
    itemId,
    brand: cell(["Brand"], 4),
    model: cell(["Model"], 5),
    prismNo: cell(["Prism No", "Prism Number"], 6),

    // Preserve the original source: Penalty column first.
    price: cleanPrice(cell(["Penalty", "Price"], 7)),

    capacity:
      normalizeCapacity(
        cell(["Storage", "Capacity", "Storage Capacity"], 2)
      ) || normalizeCapacity(tabCapacity),

    cardType: normalizeCardType(
      cell([
        "Card Type",
        "Card Color",
        "Card Colour",
        "Color",
        "Colour",
      ])
    ),
  };
}

/** Case-insensitive match on Asset Tag. */
export function findAsset(
  records: AssetRecord[],
  serial: string,
): AssetRecord | undefined {
  const normalized = serial.trim().toLowerCase();
  if (!normalized) return undefined;

  return records.find(
    (record) => record.itemId.toLowerCase() === normalized
  );
}