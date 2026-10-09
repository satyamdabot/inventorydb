import nodemailer from "nodemailer";
import type { BatchSummary } from "./receipt";
import { getStore } from "./store";
import { formatIst } from "./time";

/**
 * Emails the receipt PDF to both people on a batch: the person who sent the
 * items (From) and the person who received them (To).
 *
 * Email addresses are looked up by name in the "person" tab of the store.
 * The tab needs a name column and an email column; common header names are
 * recognised (see NAME_FIELDS and EMAIL_FIELDS below).
 *
 * Settings (Vercel → Project → Settings → Environment Variables):
 *   SMTP_USER     Gmail / Workspace address that sends the email   (required)
 *   SMTP_PASS     App password for that account                    (required)
 *   SMTP_HOST     default smtp.gmail.com
 *   SMTP_PORT     default 465
 *   MAIL_FROM     e.g. "Instawork Receipts <receipts@yourcompany.com>"
 *                 default: SMTP_USER
 *   PEOPLE_TAB    store tab with names and emails, default "person"
 *
 * For Gmail: turn on 2-Step Verification for the sending account, then create
 * an app password at https://myaccount.google.com/apppasswords and use it as
 * SMTP_PASS (not the normal account password).
 */

const NAME_FIELDS = ["name", "full_name", "person", "person_name", "Name", "Full name", "Person"];
const EMAIL_FIELDS = ["email", "email_id", "mail", "Email", "Email ID", "Email id", "E-mail"];

type Row = Record<string, unknown>;

function field(row: Row, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

const normalise = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function emailForNames(names: string[]): Promise<Map<string, string>> {
  const tab = process.env.PEOPLE_TAB || "person";
  const store = getStore();
  const list = store.list as unknown as (collection: string) => Promise<Row[]>;
  const rows = await list.call(store, tab);

  const byName = new Map<string, string>();
  for (const row of rows) {
    const name = field(row, NAME_FIELDS);
    const email = field(row, EMAIL_FIELDS);
    if (name && looksLikeEmail(email)) byName.set(normalise(name), email);
  }

  const found = new Map<string, string>();
  for (const name of names) {
    const email = name ? byName.get(normalise(name)) : undefined;
    if (email) found.set(name, email);
  }
  return found;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Receipt email needs SMTP_USER and SMTP_PASS.");
  }

  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export type ReceiptEmailResult = {
  sentTo: string[];
  /** Names on the batch with no email found in the person tab. */
  missing: string[];
};

/**
 * Sends the receipt PDF to the From and To person.
 * Throws if sending fails; returns who it was sent to and who had no email.
 */
export async function sendReceiptEmail(options: {
  summary: BatchSummary;
  title: string;
  pdf: Uint8Array;
  fileName: string;
  receiptUrl: string;
  totalPenalty: string;
}): Promise<ReceiptEmailResult> {
  const { summary, title, pdf, fileName, receiptUrl, totalPenalty } = options;

  const names = [summary.fromName, summary.toName].filter(Boolean);
  const emails = await emailForNames(names);

  const missing = names.filter((name) => !emails.has(name));
  const sentTo = [...new Set(emails.values())];

  if (sentTo.length === 0) {
    return { sentTo, missing };
  }

  const itemCount = summary.items.length;
  const when = `${formatIst(summary.occurredAt)} IST`;
  const subject = `${title} ${summary.batchId} - ${summary.fromName || "—"} to ${summary.toName || "—"}`;

  const text = [
    `${title} for batch ${summary.batchId}`,
    "",
    `Sent by: ${summary.fromName || "—"}${summary.fromHubName ? ` (${summary.fromHubName})` : ""}`,
    `Sent to: ${summary.toName || "—"}${summary.hubName ? ` (${summary.hubName})` : ""}`,
    `Date & time: ${when}`,
    `Items: ${itemCount}`,
    `Total listed penalty amount: ${totalPenalty}`,
    "",
    `View the receipt online: ${receiptUrl}`,
    "",
    "The PDF receipt is attached.",
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#666">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`;

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a">
  <p style="font-size:18px;margin:0 0 12px"><strong>${escapeHtml(title)}</strong> &middot; Batch ${escapeHtml(summary.batchId)}</p>
  <table style="border-collapse:collapse">
    ${row("Sent by", `${summary.fromName || "—"}${summary.fromHubName ? ` (${summary.fromHubName})` : ""}`)}
    ${row("Sent to", `${summary.toName || "—"}${summary.hubName ? ` (${summary.hubName})` : ""}`)}
    ${row("Date & time", when)}
    ${row("Items", String(itemCount))}
    ${row("Total listed penalty amount", totalPenalty)}
  </table>
  <p style="margin:16px 0"><a href="${escapeHtml(receiptUrl)}">View the receipt online</a></p>
  <p style="color:#666;margin:0">The PDF receipt is attached.</p>
</div>`;

  await transport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: sentTo,
    subject,
    text,
    html,
    attachments: [
      {
        filename: fileName,
        content: Buffer.from(pdf),
        contentType: "application/pdf",
      },
    ],
  });

  return { sentTo, missing };
}