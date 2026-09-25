import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS, one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import { formatIst } from "@/lib/time";
import styles from "../../admin/admin.module.css";
import { applyCorrection } from "../actions";
import CorrectionPanel from "../CorrectionPanel";

function readAttributes(raw: string): [string, string][] | string {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return Object.entries(obj).map(([k, v]) => [k, String(v)]);
  } catch {}
  return raw;
}

export default async function ItemPage({ params, searchParams }: PageProps<"/inventory/[id]">) {
  const user = await requireRole();
  const { id } = await params;
  const sp = await searchParams;
  const store = getStore();
  const item = await store.getItem(id);
  if (!item) notFound();

  const [hubs, people, history] = await Promise.all([store.list("hubs"), store.list("people"), store.getHistory(id)]);
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const personName = new Map(people.map((p) => [p.person_id, p.name]));
  const attrs = readAttributes(item.attributes);

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/inventory">← Inventory</Link>
      </p>
      <h1>{item.item_id}</h1>
      {one(sp.done) && <p className={styles.ok}>Saved.</p>}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <dl className={styles.facts}>
        <dt>Status</dt>
        <dd>{STATUS_LABELS[item.status] ?? item.status}</dd>
        <dt>Current hub</dt>
        <dd>{hubName.get(item.current_hub) ?? item.current_hub}</dd>
        <dt>Holder</dt>
        <dd>{personName.get(item.current_holder) ?? (item.current_holder || "—")}</dd>
        <dt>Home hub</dt>
        <dd>{hubName.get(item.home_hub) ?? item.home_hub}</dd>
        <dt>Prism no.</dt>
        <dd>{item.prism_no || "—"}</dd>
        <dt>Brand</dt>
        <dd>{item.brand || "—"}</dd>
        <dt>Model</dt>
        <dd>{item.model || "—"}</dd>
        <dt>Type</dt>
        <dd>{item.item_type}</dd>
        {typeof attrs === "string" ? (
          <>
            <dt>Details</dt>
            <dd>{attrs}</dd>
          </>
        ) : (
          attrs.map(([k, v]) => (
            <div key={k} className={styles.factRow}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))
        )}
      </dl>

      {user.role === "admin" && (
        <form action={applyCorrection} className={styles.list}>
          <input type="hidden" name="back" value={`/inventory/${item.item_id}`} />
          <input type="hidden" name="ids" value={item.item_id} />
          <CorrectionPanel hubs={hubs} people={people} showScan={false} />
        </form>
      )}

      <h2>History</h2>
      {history.length === 0 ? (
        <p className={styles.muted}>No events yet. History starts with the first handover or correction.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>From → To</th>
              <th>Hub</th>
              <th>Status</th>
              <th>By</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((e) => (
              <tr key={e.event_id}>
                <td>{formatIst(e.occurred_at)} IST</td>
                <td>{e.action}</td>
                <td>
                  {personName.get(e.from_person) ?? (e.from_person || "—")} → {personName.get(e.to_person) ?? (e.to_person || "—")}
                </td>
                <td>{hubName.get(e.hub) ?? e.hub}</td>
                <td>{STATUS_LABELS[e.status_after] ?? e.status_after}</td>
                <td>{e.recorded_by}</td>
                <td>{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
