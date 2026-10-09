import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toDataURL as qrToDataURL } from "qrcode";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS } from "@/lib/labels";
import { formatPrice, summarizeBatch } from "@/lib/receipt";
import { getStore } from "@/lib/store";
import { formatIst } from "@/lib/time";
import styles from "../../form.module.css";
import PrintButton from "./PrintButton";

const ACTION_TITLE: Record<string, string> = {
  check_out: "Handover receipt",
  receive: "Receipt confirmation",
  correct: "Correction record",
};

// Next.js serves public/Instawork.svg at this URL.
// The path is case-sensitive on Vercel, so the capital "I" must match the file name.
const RECEIPT_LOGO = "/Instawork.svg";

/**
 * Build the receipt URL used in the QR code.
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

  const summary = summarizeBatch(
    events,
    items,
    hubs,
    batch
  );

  if (!summary) {
    notFound();
  }

  // QR CODE GENERATION:
  // The code points to this batch's receipt.
  const receiptUrl =
    `${await baseUrl()}/handover/receipt/` +
    encodeURIComponent(summary.batchId);

  const qr = await qrToDataURL(receiptUrl, {
    margin: 1,
    width: 220,
  });

  // Missing prices must not be displayed as zero.
  const missingPriceCount = summary.items.filter(
    (item) => formatPrice(item.price) === ""
  ).length;

  const pricedCount = summary.items.length - missingPriceCount;

  // Count by storage size, e.g. "256 GB × 20, 512 GB × 6".
  const storageCounts = new Map<string, number>();
  for (const item of summary.items) {
    const key = item.storage || "Not set";
    storageCounts.set(key, (storageCounts.get(key) ?? 0) + 1);
  }
  const storageBreakdown = [...storageCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([size, count]) => `${size} × ${count}`)
    .join(", ");

  const itemCountLabel = `${summary.items.length} item${
    summary.items.length === 1 ? "" : "s"
  }`;

  const totalLabel =
    missingPriceCount > 0 && summary.totalPrice !== null
      ? "Known penalty amounts subtotal"
      : "Total listed penalty amount";

  const totalValue =
    summary.totalPrice !== null
      ? formatPrice(String(summary.totalPrice))
      : "Not set";

  const fromLocation = summary.fromHubName || "—";
  const toLocation = summary.hubName || "—";

  return (
    <main className={styles.page}>
      {/* Hidden in printed/PDF output. */}
      <p className={`${styles.back} ${styles.noPrint}`}>
        <Link href="/handover/send">
          ← Send items
        </Link>
      </p>

      <div className={styles.receipt}>
        {/* Receipt header: logo and title left, QR right. */}
        <div
          className={styles.receiptHead}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 20,
            breakInside: "avoid",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 220px" }}>
            {/* RECEIPT LOGO ONLY:
                File location: public/Instawork.svg
                No website link is attached.
                This image is inside the printable receipt. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- local receipt logo */}
            <img
              src={RECEIPT_LOGO}
              alt="Instawork"
              width={180}
              height={48}
              loading="eager"
              style={{
                display: "block",
                width: 180,
                maxWidth: "100%",
                height: "auto",
                marginBottom: 16,
              }}
            />

            <h1>
              {ACTION_TITLE[summary.action] ??
                "Batch record"}
            </h1>

            <p className={styles.muted}>
              Batch {summary.batchId} ·{" "}
              {formatIst(summary.occurredAt)} IST
            </p>
          </div>

          {/* QR CODE DISPLAY:
              Scan this code when receiving the batch. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URI */}
          <img
            src={qr}
            alt={`QR code for batch ${summary.batchId}`}
            width={140}
            height={140}
            loading="eager"
            className={styles.qr}
            style={{ flexShrink: 0 }}
          />
        </div>

        {/* Handover details: who and where, side by side. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: 12,
            breakInside: "avoid",
          }}
        >
          <section
            style={{
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <p className={styles.muted} style={{ margin: 0 }}>
              FROM
            </p>
            <dl className={styles.facts} style={{ marginTop: 6 }}>
              <dt>Person</dt>
              <dd>
                <strong>{summary.fromName || "—"}</strong>
              </dd>

              <dt>Location</dt>
              <dd>{fromLocation}</dd>
            </dl>
          </section>

          <section
            style={{
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <p className={styles.muted} style={{ margin: 0 }}>
              TO
            </p>
            <dl className={styles.facts} style={{ marginTop: 6 }}>
              <dt>Person</dt>
              <dd>
                <strong>{summary.toName || "—"}</strong>
              </dd>

              <dt>Location</dt>
              <dd>{toLocation}</dd>
            </dl>
          </section>
        </div>

        {/* Other batch details. */}
        <dl className={styles.facts}>
          <dt>Date &amp; time</dt>
          <dd>{formatIst(summary.occurredAt)} IST</dd>

          <dt>Items</dt>
          <dd>
            {itemCountLabel}
            {storageBreakdown && ` (${storageBreakdown})`}
          </dd>

          {summary.recordedBy && (
            <>
              <dt>Recorded by</dt>
              <dd>{summary.recordedBy}</dd>
            </>
          )}

          {summary.note && (
            <>
              <dt>Note</dt>
              <dd style={{ overflowWrap: "anywhere" }}>
                {summary.note}
              </dd>
            </>
          )}
        </dl>

        <h2>{itemCountLabel}</h2>

        {/* Item list. The header row repeats on each printed page.
            There is no table footer, so the total prints only once, at the end. */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Serial</th>
              <th scope="col">Prism no.</th>
              <th scope="col">Brand / Model</th>
              <th scope="col">Storage</th>
              <th scope="col">Colour</th>
              <th scope="col">Penalty</th>
              <th scope="col">Status</th>
            </tr>
          </thead>

          <tbody>
            {summary.items.map((item, index) => (
              <tr
                key={item.itemId}
                style={{ breakInside: "avoid" }}
              >
                <td>{index + 1}</td>

                <td style={{ overflowWrap: "anywhere" }}>
                  {item.itemId}
                </td>

                <td style={{ overflowWrap: "anywhere" }}>
                  {item.prismNo || "—"}
                </td>

                <td>
                  {item.model ||
                    item.brand ||
                    "—"}
                </td>

                <td style={{ whiteSpace: "nowrap" }}>
                  {item.storage || "—"}
                </td>

                <td>{item.cardType || "—"}</td>

                {/* Read the amount saved in items.price.
                    This page does not change or charge it. */}
                <td style={{ whiteSpace: "nowrap" }}>
                  {formatPrice(item.price) || "Not set"}
                </td>

                <td>
                  {STATUS_LABELS[item.statusAfter] ??
                    item.statusAfter}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary and total: always after the last item. */}
        <section
          style={{
            display: "grid",
            gap: 6,
            marginLeft: "auto",
            width: "min(100%, 360px)",
            padding: "12px 14px",
            border: "1px solid #d9d9d9",
            borderRadius: 8,
            breakInside: "avoid",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span className={styles.muted}>Total items</span>
            <span>{summary.items.length}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span className={styles.muted}>Items with a penalty amount</span>
            <span>{pricedCount}</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              paddingTop: 8,
              marginTop: 2,
              borderTop: "1px solid #d9d9d9",
              fontSize: "1.05rem",
            }}
          >
            <strong>{totalLabel}</strong>
            <strong style={{ whiteSpace: "nowrap" }}>
              {totalValue}
            </strong>
          </div>
        </section>

        {missingPriceCount > 0 && (
          <p className={styles.muted}>
            {missingPriceCount} item
            {missingPriceCount === 1
              ? " has"
              : "s have"}{" "}
            no valid stored amount. Missing amounts are
            excluded from the total and must be verified.
          </p>
        )}

        {/* Use only if this reflects approved company policy.
            The receipt itself does not authorize a deduction. */}
        <p
          style={{
            marginTop: 8,
            padding: "12px 14px",
            border: "1px solid #b91c1c",
            borderLeft: "4px solid #b91c1c",
            borderRadius: 6,
            backgroundColor: "#fff7f7",
            color: "#991b1b",
            fontSize: 14,
            lineHeight: 1.6,
            fontWeight: 600,
            breakInside: "avoid",
          }}
        >
          <strong>
            IMPORTANT — ITEM RESPONSIBILITY:
          </strong>{" "}
          You are responsible for the safekeeping and timely
          return of the items listed on this receipt. Any
          loss or damage must be reported immediately. If
          you are found responsible following review, the
          applicable penalty may be deducted from your
          salary, subject to company policy, any required
          consent, and applicable law. The listed amounts
          are not an automatic charge.
        </p>

        {/* Signatures for the printed copy. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: 32,
            marginTop: 24,
            breakInside: "avoid",
          }}
        >
          {[
            { label: "Handed over by", name: summary.fromName },
            { label: "Received by", name: summary.toName },
          ].map((sig) => (
            <div key={sig.label}>
              <div
                style={{
                  borderBottom: "1px solid #555",
                  height: 40,
                }}
              />
              <p style={{ margin: "6px 0 0" }}>
                <strong>{sig.label}:</strong> {sig.name || "—"}
              </p>
              <p className={styles.muted} style={{ margin: 0 }}>
                Signature and date
              </p>
            </div>
          ))}
        </div>

        <p className={styles.muted} style={{ fontSize: 12 }}>
          Receipt link: {receiptUrl}
        </p>
      </div>

      {/* Keep the existing print button outside printable content. */}
      <div className={styles.noPrint}>
        <PrintButton />
      </div>
    </main>
  );
}