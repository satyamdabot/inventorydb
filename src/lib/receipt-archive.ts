import { Readable } from "node:stream";
import { google } from "googleapis";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { toBuffer as qrToBuffer } from "qrcode";
import { STATUS_LABELS } from "./labels";
import { LOGO_HEIGHT, LOGO_PATHS, LOGO_WIDTH } from "./receipt-logo";
import { formatPrice, summarizeBatch, type BatchSummary } from "./receipt";
import { getStore } from "./store";
import { formatIst } from "./time";

/**
 * Receipt archive.
 *
 * After a handover is saved, this builds a PDF of the receipt, uploads it to
 * a Google Drive folder and adds one row to the "Receipts" tab of a Google
 * Sheet with a link to the PDF.
 *
 * Settings (Vercel → Project → Settings → Environment Variables):
 *   RECEIPTS_SHEET_ID         spreadsheet that holds the "Receipts" tab
 *   RECEIPTS_DRIVE_FOLDER_ID  Drive folder the PDFs are saved in
 * The defaults below are used when these are not set.
 *
 * The service account (GOOGLE_SERVICE_ACCOUNT_EMAIL) needs Editor access to
 * the spreadsheet, and the folder must be inside a Shared Drive where the
 * service account is a Content manager. Service accounts cannot save files
 * into a normal "My Drive" folder (they have no storage of their own).
 */

const DEFAULT_SHEET_ID = "1VQrdFoSkq4vAp14G8YJkIafuPOHB834Cn0tg3E2yGL0";
const DEFAULT_FOLDER_ID = "1wTvS-vNuAHuVubDaWOsc8A8EN5V3AUDs";
const RECEIPTS_TAB = "Receipts";

const RECEIPT_HEADERS = [
  "Batch ID",
  "Receipt type",
  "Date & time (IST)",
  "From",
  "To",
  "Location",
  "Item count",
  "Serials",
  "Total penalty (Rs.)",
  "Note",
  "Recorded by",
  "Receipt link",
  "PDF",
  "Archived at (IST)",
];

const ACTION_TITLE: Record<string, string> = {
  check_out: "Handover receipt",
  receive: "Receipt confirmation",
  correct: "Correction record",
};

function googleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Receipt archive needs GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY."
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

// The built-in PDF fonts only cover basic Western characters.
// Replace the rupee sign and drop anything else they cannot draw.
function pdfSafe(text: string): string {
  return text
    .replace(/₹/g, "Rs. ")
    .replace(/[\u202F\u2009\u200A]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—•…]/g, "?");
}

function rupees(raw: string): string {
  return pdfSafe(formatPrice(raw)).trim();
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number) {
  let value = pdfSafe(text);

  if (font.widthOfTextAtSize(value, size) <= maxWidth) {
    return value;
  }

  while (
    value.length > 1 &&
    font.widthOfTextAtSize(`${value}…`, size) > maxWidth
  ) {
    value = value.slice(0, -1);
  }

  return `${value}…`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;

    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function hex(color: string) {
  const n = parseInt(color.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildReceiptPdf(
  summary: BatchSummary,
  receiptUrl: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${ACTION_TITLE[summary.action] ?? "Batch record"} ${summary.batchId}`);
  doc.setAuthor("Instawork");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const margin = 40;
  const contentWidth = A4[0] - margin * 2;

  const black = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - margin;

  const text = (
    value: string,
    x: number,
    size = 10,
    font = regular,
    color = black
  ) => page.drawText(pdfSafe(value), { x, y, size, font, color });

  // Header: logo, title and QR code.
  const logoWidth = 150;
  const logoScale = logoWidth / LOGO_WIDTH;

  for (const p of LOGO_PATHS) {
    if (p.fill === "none") continue;
    page.drawSvgPath(p.d, {
      x: margin,
      y,
      scale: logoScale,
      color: hex(p.fill),
    });
  }

  const qrSize = 110;
  const qrPng = await qrToBuffer(receiptUrl, { type: "png", margin: 1, width: 330 });
  const qrImage = await doc.embedPng(qrPng);
  page.drawImage(qrImage, {
    x: A4[0] - margin - qrSize,
    y: y - qrSize,
    width: qrSize,
    height: qrSize,
  });

  y -= LOGO_HEIGHT * logoScale + 36;
  text(ACTION_TITLE[summary.action] ?? "Batch record", margin, 20, bold);

  y -= 18;
  text(
    `Batch ${summary.batchId} · ${formatIst(summary.occurredAt)} IST`,
    margin,
    10,
    regular,
    grey
  );

  y = Math.min(y, A4[1] - margin - qrSize) - 30;

  // Handover details.
  const facts: [string, string][] = [
    ["From", summary.fromName || "—"],
    ["To", summary.toName || "—"],
    ["Location", summary.hubName || "—"],
  ];
  if (summary.note) facts.push(["Note", summary.note]);

  for (const [label, value] of facts) {
    text(label, margin, 11, regular, grey);
    const lines = wrap(value, regular, 11, contentWidth - 80);
    lines.forEach((l, i) => {
      if (i > 0) y -= 15;
      text(l, margin + 80, 11);
    });
    y -= 18;
  }

  y -= 8;
  text(
    `${summary.items.length} item${summary.items.length === 1 ? "" : "s"}`,
    margin,
    13,
    bold
  );
  y -= 22;

  // Items table.
  const cols = [
    { title: "#", width: 24 },
    { title: "Serial", width: 140 },
    { title: "Brand", width: 70 },
    { title: "Model", width: 136 },
    { title: "Penalty", width: 70 },
    { title: "Status", width: contentWidth - 440 },
  ];

  const drawRow = (cells: string[], font: PDFFont) => {
    let x = margin;
    cells.forEach((cell, i) => {
      text(fit(cell, font, 9.5, cols[i].width - 6), x + 2, 9.5, font);
      x += cols[i].width;
    });
    page.drawLine({
      start: { x: margin, y: y - 6 },
      end: { x: margin + contentWidth, y: y - 6 },
      thickness: 0.6,
      color: line,
    });
    y -= 20;
  };

  const header = cols.map((c) => c.title);
  drawRow(header, bold);

  summary.items.forEach((item, index) => {
    if (y < margin + 140) {
      page = doc.addPage(A4);
      y = A4[1] - margin;
      drawRow(header, bold);
    }

    drawRow(
      [
        String(index + 1),
        item.itemId,
        item.brand || "—",
        item.model || "—",
        rupees(item.price) || "Not set",
        STATUS_LABELS[item.statusAfter] ?? item.statusAfter,
      ],
      regular
    );
  });

  const missingPriceCount = summary.items.filter(
    (item) => formatPrice(item.price) === ""
  ).length;

  text(
    missingPriceCount > 0 && summary.totalPrice !== null
      ? "Known penalty amounts subtotal"
      : "Total listed penalty amount",
    margin + 2,
    10,
    bold
  );
  text(
    summary.totalPrice !== null ? rupees(String(summary.totalPrice)) : "Not set",
    margin + cols.slice(0, 4).reduce((s, c) => s + c.width, 0) + 2,
    10,
    bold
  );
  y -= 26;

  if (missingPriceCount > 0) {
    text(
      `${missingPriceCount} item${missingPriceCount === 1 ? " has" : "s have"} no valid stored amount. Missing amounts are excluded from the total and must be verified.`,
      margin,
      9,
      regular,
      grey
    );
    y -= 20;
  }

  // Responsibility notice, same wording as the on-screen receipt.
  const notice =
    "IMPORTANT — ITEM RESPONSIBILITY: You are responsible for the safekeeping and timely return of the items listed on this receipt. Any loss or damage must be reported immediately. If you are found responsible following review, the applicable penalty may be deducted from your salary, subject to company policy, any required consent, and applicable law. The listed amounts are not an automatic charge.";

  const noticeLines = wrap(notice, bold, 9.5, contentWidth - 24);
  const boxHeight = noticeLines.length * 14 + 16;

  if (y - boxHeight < margin) {
    page = doc.addPage(A4);
    y = A4[1] - margin;
  }

  page.drawRectangle({
    x: margin,
    y: y - boxHeight + 12,
    width: contentWidth,
    height: boxHeight,
    color: rgb(1, 0.97, 0.97),
    borderColor: rgb(0.73, 0.11, 0.11),
    borderWidth: 1,
  });

  y -= 4;
  for (const l of noticeLines) {
    text(l, margin + 12, 9.5, bold, rgb(0.6, 0.11, 0.11));
    y -= 14;
  }

  return doc.save();
}

/* ------------------------------------------------------------------ */
/* Drive + Sheet                                                       */
/* ------------------------------------------------------------------ */

// Stop text typed by users from being read as a spreadsheet formula.
function cell(value: string | number): string | number {
  if (typeof value === "number") return value;
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

async function ensureReceiptsTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === RECEIPTS_TAB
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: RECEIPTS_TAB } } }],
      },
    });
  }

  const head = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${RECEIPTS_TAB}'!A1:A1`,
  });

  if (!head.data.values?.[0]?.[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${RECEIPTS_TAB}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [RECEIPT_HEADERS] },
    });
  }
}

/**
 * Build the receipt PDF for one batch, save it to Drive and log it in the
 * "Receipts" tab. Errors are logged and never thrown, so a Drive or Sheets
 * problem can never undo or block a handover that was already saved.
 */
export async function archiveReceipt(batchId: string, baseUrl: string) {
  try {
    const store = getStore();
    const [events, items, hubs] = await Promise.all([
      store.list("events"),
      store.list("items"),
      store.list("hubs"),
    ]);

    const summary = summarizeBatch(events, items, hubs, batchId);
    if (!summary) {
      console.error(`[receipt-archive] Batch ${batchId} not found.`);
      return;
    }

    const receiptUrl = `${baseUrl}/handover/receipt/${encodeURIComponent(batchId)}`;
    const pdf = await buildReceiptPdf(summary, receiptUrl);

    const auth = googleAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const folderId = process.env.RECEIPTS_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
    const spreadsheetId = process.env.RECEIPTS_SHEET_ID || DEFAULT_SHEET_ID;

    // File name: "<person receiving the items> - <date> - <batch>.pdf",
    // e.g. "Aryyaneel Saikia - 08 Oct 2026 - b-737e2401.pdf".
    // The batch ID keeps names unique when one person gets several receipts on the same day.
    const personName =
      (summary.toName || "Unknown")
        .replace(/[\\/:*?"<>|#%]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Unknown";

    const occurred = Date.parse(summary.occurredAt);
    const datePart = Number.isNaN(occurred)
      ? summary.occurredAt.slice(0, 10)
      : new Date(occurred).toLocaleDateString("en-GB", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

    const fileName = `${personName} - ${datePart} - ${batchId}.pdf`;

    const uploaded = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: "application/pdf",
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from(Buffer.from(pdf)),
      },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });

    const pdfLink =
      uploaded.data.webViewLink ??
      `https://drive.google.com/file/d/${uploaded.data.id}/view`;

    await ensureReceiptsTab(sheets, spreadsheetId);

    const firstEvent = events.find((e) => e.batch_id === batchId);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${RECEIPTS_TAB}'!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            cell(batchId),
            cell(ACTION_TITLE[summary.action] ?? summary.action),
            cell(formatIst(summary.occurredAt)),
            cell(summary.fromName),
            cell(summary.toName),
            cell(summary.hubName),
            summary.items.length,
            cell(summary.items.map((i) => i.itemId).join(", ")),
            summary.totalPrice ?? "",
            cell(summary.note),
            cell(firstEvent?.recorded_by ?? ""),
            `=HYPERLINK("${receiptUrl}", "Open receipt")`,
            `=HYPERLINK("${pdfLink}", "${fileName.replace(/"/g, "")}")`,
            cell(formatIst(new Date().toISOString())),
          ],
        ],
      },
    });
  } catch (error) {
    console.error(`[receipt-archive] Could not archive batch ${batchId}:`, error);
  }
}