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

/** The scheme and host this request came in on, so the QR always points back at this same site. */
async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ReceiptPage({ params }: PageProps<"/handover/receipt/[batch]">) {
  await requireRole("admin", "im");
  const { batch } = await params;
  const store = getStore();
  const [events, items, hubs] = await Promise.all([store.list("events"), store.list("items"), store.list("hubs")]);
  const summary = summarizeBatch(events, items, hubs, batch);
  if (!summary) notFound();

  const url = `${await baseUrl()}/handover/receipt/${summary.batchId}`;
  const qr = await qrToDataURL(url, { margin: 1, width: 220 });

  return (
    <main className={styles.page}>
      <p className={`${styles.back} ${styles.noPrint}`}>
        <Link href="/handover/send">← Send cards</Link>
      </p>

      <div className={styles.receipt}>
        <div className={styles.receiptHead}>
          <div>
            <h1>{ACTION_TITLE[summary.action] ?? "Batch record"}</h1>
            <p className={styles.muted}>
              Batch {summary.batchId} · {formatIst(summary.occurredAt)} IST
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small generated data: URI, not a served asset */}
          <img src={qr} alt={`QR code for batch ${summary.batchId}`} width={140} height={140} className={styles.qr} />
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

        <h2>{summary.items.length} card{summary.items.length === 1 ? "" : "s"}</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Serial</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.items.map((i, n) => (
              <tr key={i.itemId}>
                <td>{n + 1}</td>
                <td>{i.itemId}</td>
                <td>{i.brand}</td>
                <td>{i.model}</td>
                <td>{formatPrice(i.price)}</td>
                <td>{STATUS_LABELS[i.statusAfter as Status] ?? i.statusAfter}</td>
              </tr>
            ))}
          </tbody>
          {summary.totalPrice !== null && (
            <tfoot>
              <tr>
                <td colSpan={4}></td>
                <td>
                  <strong>{formatPrice(String(summary.totalPrice))}</strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>

        <p className={styles.muted}>
          Scan the QR code above when receiving this batch to load every card here in one go, instead of
          scanning each one again.
        </p>
      </div>

      <div className={styles.noPrint}>
        <PrintButton />
      </div>
    </main>
  );
}
