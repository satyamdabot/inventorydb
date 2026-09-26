// Clears the ACTIVITY ONLY: every row of the `events` tab, and puts each card back to its starting position
// (in stock, at its home hub, no holder). Users, people, hubs, card details and settings are not touched.
//
//   npm run reset:activity                                 preview only, nothing is changed
//   npm run reset:activity -- --confirm=RESET-ACTIVITY     really do it
//
// Before anything is cleared, the `events` and `items` tabs are duplicated inside the same sheet as
// backup_events_<time> and backup_items_<time>. To undo, copy the rows back from those tabs.
import { google } from "googleapis";
import { activityBaseline, differsFromBaseline } from "../src/lib/reset";
import { getStore } from "../src/lib/store";
import { istTimestamp } from "../src/lib/time";

process.env.STORE = "sheets";
const CONFIRM_WORD = "RESET-ACTIVITY";
const confirmed = process.argv.includes(`--confirm=${CONFIRM_WORD}`);
const wrongConfirm = process.argv.some((a) => a.startsWith("--confirm") && a !== `--confirm=${CONFIRM_WORD}`);
if (wrongConfirm) {
  console.error(`The confirmation must be exactly --confirm=${CONFIRM_WORD}. Nothing was changed.`);
  process.exit(1);
}

const store = getStore();
const [events, items] = await Promise.all([store.list("events"), store.list("items")]);
const moving = items.filter(differsFromBaseline);

const byAction = new Map<string, number>();
for (const e of events) byAction.set(e.action, (byAction.get(e.action) ?? 0) + 1);
const times = events.map((e) => Date.parse(e.occurred_at)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);

console.log("\nWhat this will do");
console.log(`  DELETE  ${events.length} activity records from the events tab`);
console.log(`          (${[...byAction].map(([a, n]) => `${n} ${a}`).join(", ") || "none"})`);
if (times.length) console.log(`          from ${istTimestamp(new Date(times[0]))} to ${istTimestamp(new Date(times[times.length - 1]))}`);
console.log(`  RESET   ${moving.length} of ${items.length} cards back to in stock at their home hub, with no holder`);
console.log("  KEEP    users, people, hubs, card details (serial, prism no., brand, model), settings");
console.log("  BACKUP  the events and items tabs are copied first, inside this same sheet\n");

if (!confirmed) {
  console.log("PREVIEW ONLY. Nothing was changed.");
  console.log(`To do it for real:  npm run reset:activity -- --confirm=${CONFIRM_WORD}\n`);
  process.exit(0);
}

// 1. Back up both tabs inside the same spreadsheet.
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const api = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SHEET_ID!;
const stamp = istTimestamp().replace(/[-:T]/g, "").slice(0, 14).replace(/^(\d{8})(\d{6})$/, "$1_$2");

const meta = await api.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
const idOf = (title: string) => meta.data.sheets?.find((s) => s.properties?.title === title)?.properties?.sheetId;
const [eventsId, itemsId] = [idOf("events"), idOf("items")];
if (eventsId == null || itemsId == null) throw new Error("Could not find the events and items tabs. Nothing was changed.");

await api.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [
      { duplicateSheet: { sourceSheetId: eventsId, newSheetName: `backup_events_${stamp}` } },
      { duplicateSheet: { sourceSheetId: itemsId, newSheetName: `backup_items_${stamp}` } },
    ],
  },
});
console.log(`Backed up to tabs backup_events_${stamp} and backup_items_${stamp}`);

// 2. Clear every activity row (the header row stays).
await api.spreadsheets.values.clear({ spreadsheetId, range: "events!A2:Z" });

// 3. Put every card back to its starting position.
await store.upsert("items", moving.map(activityBaseline));

// 4. Check the result.
const [eventsAfter, itemsAfter] = await Promise.all([store.list("events"), store.list("items")]);
const stillOut = itemsAfter.filter(differsFromBaseline).length;
console.log(`Done. Events left: ${eventsAfter.length}. Cards not at their starting position: ${stillOut}. Cards in total: ${itemsAfter.length}.`);
if (eventsAfter.length !== 0 || stillOut !== 0 || itemsAfter.length !== items.length) {
  console.error("Something did not match. Check the sheet, and restore from the backup tabs if needed.");
  process.exit(1);
}
