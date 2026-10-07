/** Details returned to the Add item form. */
export interface AssetRecord {
  itemId: string;
  brand: string;
  model: string;
  prismNo: string;
  price: string;
  capacity?: string;
  cardType?: string;
}

/**
 * Convert a valid amount into a plain numeric string.
 * Examples:
 * "₹7,500.00" -> "7500.00"
 * "INR 7500"  -> "7500"
 *
 * Missing or invalid values stay blank—not zero.
 */
export function cleanPrice(raw: string): string {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/₹/g, "")
    .replace(/\bINR\b/gi, "")
    .replace(/[,\s]/g, "");

  if (!cleaned || !/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return "";
  }

  const amount = Number(cleaned);

  return Number.isFinite(amount) ? cleaned : "";
}

/** Normalize supported storage values for the form dropdown. */
export function normalizeCapacity(raw: string): string {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (value === "512" || value === "512GB") {
    return "512 GB";
  }

  if (value === "256" || value === "256GB") {
    return "256 GB";
  }

  return "";
}

/**
 * Normalize explicit colour values.
 * Accepts Black, Black card, Green, and Green card.
 * Does not infer colour from a model or brand.
 */
export function normalizeCardType(raw: string): string {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (value === "black" || value === "black card") {
    return "Black";
  }

  if (value === "green" || value === "green card") {
    return "Green";
  }

  return "";
}

/** Ignore spaces, case and punctuation when matching headers. */
function normalizeHeader(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Parse one reference asset-sheet row.
 *
 * When headers are supplied, columns are matched by name.
 * Without headers, preserve the original A:I column mapping:
 *
 * A: Asset Tag
 * B: SD Card Serial No
 * C: Storage
 * D: Country Origin
 * E: Brand
 * F: Model
 * G: Prism No.
 * H: Penalty
 * I: Status
 */
export function parseAssetRow(
  row: string[],
  tabCapacity = "",
  headers: string[] = []
): AssetRecord | null {
  const normalizedHeaders = headers.map(normalizeHeader);

  /**
   * Return non-empty values from matching columns in priority order.
   * This allows a blank Penalty cell to fall back to Price.
   */
  function values(
    aliases: string[],
    legacyIndex?: number
  ): string[] {
    if (headers.length === 0) {
      if (legacyIndex === undefined) return [];

      const value = String(row[legacyIndex] ?? "").trim();
      return value ? [value] : [];
    }

    const results: string[] = [];

    for (const alias of aliases) {
      const expected = normalizeHeader(alias);

      for (let index = 0; index < normalizedHeaders.length; index++) {
        if (normalizedHeaders[index] !== expected) continue;

        const value = String(row[index] ?? "").trim();

        if (value) {
          results.push(value);
        }
      }
    }

    return results;
  }

  function firstValue(
    aliases: string[],
    legacyIndex?: number
  ): string {
    return values(aliases, legacyIndex)[0] ?? "";
  }

  // Match only Asset Tag, not another serial column.
  const itemId = firstValue(["Asset Tag"], 0);

  if (!itemId) return null;

  const model = firstValue(
    [
      "Model",
      "Model Name",
      "Card Model",
      "SD Card Model",
    ],
    5
  );

  // Prefer the original Penalty source, then fall back to Price.
  // This preserves your current form's "Price / source penalty" use.
  let price = "";

  for (const value of values(
    ["Penalty", "Penalty Amount", "Price", "Card Price"],
    7
  )) {
    const cleaned = cleanPrice(value);

    if (cleaned !== "") {
      price = cleaned;
      break;
    }
  }

  let capacity = "";

  for (const value of values(
    ["Storage", "Capacity", "Storage Capacity", "Card Storage"],
    2
  )) {
    const normalized = normalizeCapacity(value);

    if (normalized) {
      capacity = normalized;
      break;
    }
  }

  // If storage is unavailable, use the tab name.
  if (!capacity) {
    capacity = normalizeCapacity(tabCapacity);
  }

  let cardType = "";

  for (const value of values([
    "Card Colour",
    "Card Color",
    "Colour",
    "Color",
    "Card Type",
    "Type of Card",
  ])) {
    const normalized = normalizeCardType(value);

    if (normalized) {
      cardType = normalized;
      break;
    }
  }

  return {
    itemId,
    brand: firstValue(["Brand", "Card Brand"], 4),
    model,
    prismNo: firstValue(["Prism No", "Prism Number"], 6),
    price,
    capacity,
    cardType,
  };
}

/** Case-insensitive lookup using the Asset Tag. */
export function findAsset(
  records: AssetRecord[],
  serial: string
): AssetRecord | undefined {
  const normalized = serial.trim().toLowerCase();

  if (!normalized) return undefined;

  return records.find(
    (record) =>
      record.itemId.trim().toLowerCase() === normalized
  );
}