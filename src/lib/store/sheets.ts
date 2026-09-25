import { google, type sheets_v4 } from "googleapis";
import { TABS, type Row, type TabName } from "../schema";
import type { TableBackend } from "./backend";

function columnLetter(n: number): string {
  let s = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) {
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  }
  return s;
}

const tabs = Object.keys(TABS) as TabName[];

export interface SheetsConfig {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
}

// Google Sheets backend. The sheet is written only through the service account.
export class SheetsBackend implements TableBackend {
  private api: sheets_v4.Sheets;

  constructor(private cfg: SheetsConfig) {
    const auth = new google.auth.JWT({
      email: cfg.clientEmail,
      key: cfg.privateKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.api = google.sheets({ version: "v4", auth });
  }

  private get id() {
    return this.cfg.spreadsheetId;
  }

  async ensureTabs() {
    const meta = await this.api.spreadsheets.get({
      spreadsheetId: this.id,
      fields: "sheets.properties.title",
    });
    const existing = new Set(meta.data.sheets?.map((s) => s.properties?.title));
    const missing = tabs.filter((t) => !existing.has(t));
    if (missing.length) {
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: this.id,
        requestBody: {
          requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
        },
      });
    }
    await this.api.spreadsheets.values.batchUpdate({
      spreadsheetId: this.id,
      requestBody: {
        valueInputOption: "RAW",
        data: tabs.map((t) => ({
          range: `${t}!A1:${columnLetter(TABS[t].length)}1`,
          values: [[...TABS[t]]],
        })),
      },
    });
  }

  async readAll(tab: TabName) {
    const cols = TABS[tab];
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: this.id,
      range: `${tab}!A2:${columnLetter(cols.length)}`,
    });
    return (res.data.values ?? [])
      .filter((r) => r[0] !== undefined && r[0] !== "")
      .map((r) => Object.fromEntries(cols.map((c, i) => [c, String(r[i] ?? "")])));
  }

  private toValues(tab: TabName, rows: Row[]) {
    return rows.map((r) => TABS[tab].map((c) => r[c] ?? ""));
  }

  async append(tab: TabName, rows: Row[]) {
    if (!rows.length) return;
    await this.api.spreadsheets.values.append({
      spreadsheetId: this.id,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: this.toValues(tab, rows) },
    });
  }

  async upsert(tab: TabName, rows: Row[]) {
    if (!rows.length) return;
    const cols = TABS[tab];
    const key = cols[0];
    const last = columnLetter(cols.length);
    const keys = await this.api.spreadsheets.values.get({
      spreadsheetId: this.id,
      range: `${tab}!A:A`,
    });
    const rowOf = new Map<string, number>();
    (keys.data.values ?? []).forEach((r, i) => {
      if (i > 0 && r[0]) rowOf.set(String(r[0]), i + 1);
    });

    const updates: sheets_v4.Schema$ValueRange[] = [];
    const inserts: Row[] = [];
    for (const row of rows) {
      const at = rowOf.get(row[key]);
      if (at) updates.push({ range: `${tab}!A${at}:${last}${at}`, values: this.toValues(tab, [row]) });
      else inserts.push(row);
    }
    if (updates.length) {
      await this.api.spreadsheets.values.batchUpdate({
        spreadsheetId: this.id,
        requestBody: { valueInputOption: "RAW", data: updates },
      });
    }
    await this.append(tab, inserts);
  }
}
