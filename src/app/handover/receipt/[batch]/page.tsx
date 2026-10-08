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

// Next.js serves public/instawork.svg at this URL.
const RECEIPT_LOGO = "/instawork.svg";

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
                File location: public/instawork.svg
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

        {/* Handover details. */}
        <dl className={styles.facts}>
          <dt>From</dt>
          <dd>{summary.fromName || "—"}</dd>

          <dt>To</dt>
          <dd>{summary.toName || "—"}</dd>

          <dt>Location</dt>
          <dd>{summary.hubName || "—"}</dd>

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

                <td style={{ overflowWrap: "anywhere" }}>
                  {item.itemId}
                </td>

                <td>{item.brand || "—"}</td>
                <td>{item.model || "—"}</td>

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

          <tfoot>
            <tr>
              <th
                scope="row"
                colSpan={4}
                style={{ textAlign: "left" }}
              >
                {missingPriceCount > 0 &&
                summary.totalPrice !== null
                  ? "Known penalty amounts subtotal"
                  : "Total listed penalty amount"}
              </th>

              <td style={{ whiteSpace: "nowrap" }}>
                <strong>
                  {summary.totalPrice !== null
                    ? formatPrice(
                        String(summary.totalPrice)
                      )
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
            marginTop: 16,
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
      </div>

      {/* Keep the existing print button outside printable content. */}
      <div className={styles.noPrint}>
        <PrintButton />
      </div>
    </main>
  );
}