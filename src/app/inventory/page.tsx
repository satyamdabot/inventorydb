import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS, one } from "@/lib/labels";
import { STATUSES, type Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import styles from "../admin/admin.module.css";
import { applyCorrection } from "./actions";
import CorrectionPanel from "./CorrectionPanel";

const PAGE_SIZE = 100;

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const user = await requireRole();
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const q = one(sp.q).trim().toLowerCase();
  const status = one(sp.status); // one status, or several separated by commas (from dashboard tiles)
  const statuses = status.split(",").filter(Boolean);
  const hub = one(sp.hub);
  const holder = one(sp.holder);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const store = getStore();
  const [items, hubs, people] = await Promise.all([store.list("items"), store.list("hubs"), store.list("people")]);
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const personName = new Map(people.map((p) => [p.person_id, p.name]));

  const matches = items.filter(
    (i) =>
      (!statuses.length || statuses.includes(i.status)) &&
      (!hub || i.current_hub === hub) &&
      (!holder || i.current_holder === holder) &&
      (!q ||
        i.item_id.toLowerCase().includes(q) ||
        i.prism_no.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.attributes.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const shown = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const sortedHubs = [...hubs].sort((a, b) => a.name.localeCompare(b.name));

  const pageLink = (p: number) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(hub && { hub }), ...(holder && { holder }), page: String(p) });
    return `/inventory?${params}`;
  };

  const table = (
    <table className={styles.table}>
      <thead>
        <tr>
          {isAdmin && <th />}
          <th>Serial</th>
          <th>Prism no.</th>
          <th>Brand</th>
          <th>Model</th>
          <th>Status</th>
          <th>Current hub</th>
          <th>Holder</th>
          <th>Home hub</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((i) => (
          <tr key={i.item_id}>
            {isAdmin && (
              <td>
                <input type="checkbox" name="ids" value={i.item_id} aria-label={`Select ${i.item_id}`} />
              </td>
            )}
            <td>
              <Link href={`/inventory/${i.item_id}`}>{i.item_id}</Link>
            </td>
            <td>{i.prism_no}</td>
            <td>{i.brand}</td>
            <td>{i.model}</td>
            <td>{STATUS_LABELS[i.status] ?? i.status}</td>
            <td>{hubName.get(i.current_hub) ?? i.current_hub}</td>
            <td>{personName.get(i.current_holder) ?? i.current_holder}</td>
            <td>{hubName.get(i.home_hub) ?? i.home_hub}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main className={styles.pageWide}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Inventory</h1>
      {one(sp.done) && (
        <p className={styles.ok}>
          Updated {one(sp.done)} card(s)
          {Number(one(sp.same)) > 0 && `, ${one(sp.same)} already in that state`}.
        </p>
      )}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <form className={styles.row} method="get">
        <input name="q" defaultValue={one(sp.q)} placeholder="Search serial, prism no., brand or model" />
        {statuses.length > 1 ? (
          <>
            <input type="hidden" name="status" value={status} />
            <span className={styles.muted}>
              Status: {statuses.map((s) => STATUS_LABELS[s as Status] ?? s).join(" or ")} ·{" "}
              <Link href="/inventory">clear</Link>
            </span>
          </>
        ) : (
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <select name="hub" defaultValue={hub}>
          <option value="">All hubs</option>
          {sortedHubs.map((h) => (
            <option key={h.hub_id} value={h.hub_id}>
              {h.name}
            </option>
          ))}
        </select>
        {holder && <input type="hidden" name="holder" value={holder} />}
        <button type="submit">Filter</button>
        {holder && (
          <span className={styles.muted}>
            Holder: {people.find((p) => p.person_id === holder)?.name ?? holder} · <Link href="/inventory">clear</Link>
          </span>
        )}
      </form>

      <p className={styles.muted}>
        {matches.length} of {items.length} cards. Showing {shown.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
        {(page - 1) * PAGE_SIZE + shown.length}.
      </p>

      {isAdmin ? (
        <form action={applyCorrection} className={styles.list}>
          <input type="hidden" name="back" value="/inventory" />
          <CorrectionPanel hubs={hubs} people={people} showScan />
          {table}
        </form>
      ) : (
        table
      )}

      <div className={styles.row}>
        {page > 1 && <Link href={pageLink(page - 1)}>← Previous</Link>}
        <span className={styles.muted}>
          Page {page} of {pages}
        </span>
        {page < pages && <Link href={pageLink(page + 1)}>Next →</Link>}
      </div>
    </main>
  );
}
