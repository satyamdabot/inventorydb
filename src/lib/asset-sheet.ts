import { google } from "googleapis";
import { parseAssetRow, type AssetRecord } from "./asset-lookup";

const TABS = ["512 GB", "256 GB"];
const TTL_MS = 5 * 60 * 1000;

let cache: {
  records: AssetRecord[];
  at: number;
  spreadsheetId: string;
} | null = null;

/**
 * Read-only reference asset sheet.
 * This is separate from the application's inventory database.
 */
export async function loadAssetRecords(): Promise<AssetRecord[]> {
  const spreadsheetId = process.env.ASSET_SHEET_ID;
  if (!spreadsheetId) return [];

  if (
    cache &&
    cache.spreadsheetId === spreadsheetId &&
    Date.now() - cache.at < TTL_MS
  ) {
    return cache.records;
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const api = google.sheets({ version: "v4", auth });

  const results = await Promise.all(
    TABS.map(async (tab) => {
      const result = await api.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tab}'!A1:Z`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });

      const rows: string[][] = (result.data.values ?? []).map(
        (row) => row.map((value) => String(value ?? ""))
      );

      if (rows.length === 0) return [];

      const headers = rows[0];

      const hasAssetTag = headers.some(
        (header) =>
          header.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          "assettag"
      );

      if (!hasAssetTag) {
        throw new Error(
          `The "${tab}" asset-sheet tab needs an "Asset Tag" header in row 1.`
        );
      }

      const records: AssetRecord[] = [];

      for (const row of rows.slice(1)) {
        const record = parseAssetRow(row, tab, headers);
        if (record) records.push(record);
      }

      return records;
    })
  );

  const records = results.flat();

  cache = {
    records,
    at: Date.now(),
    spreadsheetId,
  };

  return records;
}