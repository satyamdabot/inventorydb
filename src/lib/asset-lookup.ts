/** One row from the reference asset sheet, matched by Asset Tag (our serial / item_id). */
export interface AssetRecord {
  itemId: string;
  brand: string;
  model: string;
  prismNo: string;
  price: string;
}

/** "₹20,000.00" -> "20000.00". Blank or already-plain input passes through. */
export function cleanPrice(raw: string): string {
  return raw.replace(/[^0-9.]/g, "");
}

/** A raw sheet row (Asset Tag, SD Card Serial No, Storage, Country Origin, Brand, Model, Prism No., Penalty, Status). */
export function parseAssetRow(row: string[]): AssetRecord | null {
  const itemId = (row[0] ?? "").trim();
  if (!itemId) return null;
  return {
    itemId,
    brand: (row[4] ?? "").trim(),
    model: (row[5] ?? "").trim(),
    prismNo: (row[6] ?? "").trim(),
    price: cleanPrice(row[7] ?? ""),
  };
}

/** Case-insensitive match on the Asset Tag, same convention as everywhere else in the app. */
export function findAsset(records: AssetRecord[], serial: string): AssetRecord | undefined {
  const s = serial.trim().toLowerCase();
  if (!s) return undefined;
  return records.find((r) => r.itemId.toLowerCase() === s);
}
