import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toDataURL as qrToDataURL } from "qrcode";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS } from "@/lib/labels";
import { formatPrice, summarizeBatch } from "@/lib/receipt";
import type { Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import { formatIst } from "@/lib/time";
import styles from "../../form.module.css";
import PrintButton from "./PrintButton";

const ACTION_TITLE: Record<string, string> = {
  check_out: "Handover receipt",
  receive: "Receipt confirmation",
  correct: "Correction record",
};

/**
 * Get the current site's scheme and host.
 * The QR code uses this URL to point back to this receipt.
 */
async function baseUrl() {
  const h = await headers();

  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    "localhost:3000";

  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}

export default async function ReceiptPage({
  params,
}: PageProps<"/handover/receipt/[batch]">) {
  await requireRole("admin", "im", "rig");

  const { batch } = await params;
  const store = getStore();

  const [events, items, hubs] = await Promise.all([
    store.list("events"),
    store.list("items"),
    store.list("hubs"),
  ]);

  const summary = summarizeBatch(events, items, hubs, batch);

  if (!summary) {
    notFound();
  }

  // QR CODE GENERATION:
  // Encode this batch's receipt URL as a QR-code image.
  const url = `${await baseUrl()}/handover/receipt/${summary.batchId}`;

  const qr = await qrToDataURL(url, {
    margin: 1,
    width: 220,
  });

  // Missing or invalid prices should display "Not set", not zero.
  const missingPriceCount = summary.items.filter(
    (item) => formatPrice(item.price) === ""
  ).length;

  return (
    <main className={styles.page}>
      <p className={`${styles.back} ${styles.noPrint}`}>
        <Link href="/handover/send">← Send items</Link>
      </p>

      <div className={styles.receipt}>
        <div className={styles.receiptHead}>
          <div>
            <h1>
              {ACTION_TITLE[summary.action] ?? "Batch record"}
            </h1>

            <p className={styles.muted}>
              Batch {summary.batchId} ·{" "}
              {formatIst(summary.occurredAt)} IST
            </p>
          </div>

          {/* QR CODE DISPLAY:
              This image contains the receipt URL for this batch.
              Scan it on the Receive items page to identify the batch. */}

          {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URI */}
          <img
            src={qr}
            alt={`QR code for batch ${summary.batchId}`}
            width={140}
            height={140}
            className={styles.qr}
          />
        </div>

        <dl className={styles.facts}>
          <dt>From</dt>
          <dd>{summary.fromName || "—"}</dd>

          <dt>To</dt>
          <dd>{summary.toName || "—"}</dd>

          <dt>Location</dt>
          <dd>{summary.hubName}</dd>

          {summary.note && (
            <>
              <dt>Note</dt>
              <dd>{summary.note}</dd>
            </>
          )}
        </dl>

        <h2>
          {summary.items.length} item
          {summary.items.length === 1 ? "" : "s"}
        </h2>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Serial</th>
              <th scope="col">Brand</th>
              <th scope="col">Model</th>
              <th scope="col">Penalty</th>
              <th scope="col">Status</th>
            </tr>
          </thead>

          <tbody>
            {summary.items.map((item, index) => (
              <tr key={item.itemId}>
                <td>{index + 1}</td>
                <td>{item.itemId}</td>
                <td>{item.brand}</td>
                <td>{item.model}</td>

                {/* Uses the stored item price, not a separate
                    calculated or assigned penalty. */}
                <td>
                  {formatPrice(item.price) || "Not set"}
                </td>

                <td>
                  {STATUS_LABELS[item.statusAfter as Status] ??
                    item.statusAfter}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <th
                scope="row"
                colSpan={4}
                style={{ textAlign: "left" }}
              >
                {missingPriceCount > 0 &&
                summary.totalPrice !== null
                  ? "Known stored prices subtotal"
                  : "Total stored price"}
              </th>

              <td>
                <strong>
                  {summary.totalPrice !== null
                    ? formatPrice(String(summary.totalPrice))
                    : "Not set"}
                </strong>
              </td>

              <td></td>
            </tr>
          </tfoot>
        </table>

        {missingPriceCount > 0 && (
          <p className={styles.muted}>
            {missingPriceCount} item
            {missingPriceCount === 1 ? " has" : "s have"} no valid
            stored price. Missing amounts are not included in the
            total. Save prices as plain numbers, such as 7500,
            without a currency symbol or commas.
          </p>
        )}

        <p className={styles.muted}>
          The Penalty column currently shows stored item prices,
          not a separately assessed penalty.
        </p>

        <p className={styles.muted}>
          Scan the QR code above when receiving this batch to load
          every item here in one go, instead of scanning each one
          again.
        </p>
      </div>

      <div className={styles.noPrint}>
        <PrintButton />
      </div>
    </main>
  );
}