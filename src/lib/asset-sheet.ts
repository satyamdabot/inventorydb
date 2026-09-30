import { google } from "googleapis";
import { parseAssetRow, type AssetRecord } from "./asset-lookup";

const TABS = ["512 GB", "256 GB"];
const TTL_MS = 5 * 60 * 1000;

let cache: { records: AssetRecord[]; at: number } | null = null;

/**
 * The customer's own asset sheet (a different spreadsheet from our DB), read-only, used only to
 * auto-fill "Add a card". Returns [] when ASSET_SHEET_ID isn't set, so this feature is opt-in.
 */
export async function loadAssetRecords(): Promise<AssetRecord[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.records;

  const spreadsheetId = process.env.ASSET_SHEET_ID;
  if (!spreadsheetId) return [];

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const api = google.sheets({ version: "v4", auth });

  const results = await Promise.all(
    TABS.map((tab) => api.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A2:I` })),
  );
  const records = results.flatMap((r) => (r.data.values ?? []).flatMap((row) => parseAssetRow(row as string[]) ?? []));
  cache = { records, at: Date.now() };
  return records;
}
