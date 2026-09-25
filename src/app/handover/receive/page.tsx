import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import styles from "../../admin/admin.module.css";
import { receiveCards } from "../actions";

export default async function ReceivePage({ searchParams }: PageProps<"/handover/receive">) {
  const user = await requireRole("admin", "im");
  const sp = await searchParams;
  const store = getStore();
  const [items, hubs, people] = await Promise.all([store.list("items"), store.list("hubs"), store.list("people")]);
  const activeHubs = hubs.filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const personName = new Map(people.map((p) => [p.person_id, p.name]));

  // Default to the signed-in IM's own hub, else the central hub.
  const myHub = people.find((p) => p.person_id === user.personId)?.hub;
  const hub = activeHubs.some((h) => h.hub_id === one(sp.hub))
    ? one(sp.hub)
    : (myHub ?? activeHubs.find((h) => h.is_central === "true")?.hub_id ?? activeHubs[0]?.hub_id ?? "");
  const pending = items.filter((i) => i.status === "pending" && i.current_hub === hub);

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Receive cards</h1>
      <p className={styles.muted}>
        Take cards into stock at a hub: pending cards sent to it, or cards coming back from an IFO, FO or
        the rig team. Scan the QR codes, or tick the pending cards below.
      </p>
      {one(sp.done) && <p className={styles.ok}>Received {one(sp.done)} card(s) into stock.</p>}
      {one(sp.mismatch) && <p className={styles.error}>{one(sp.mismatch)} It was recorded on each card&apos;s history.</p>}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <form method="get" className={styles.row}>
        <select name="hub" defaultValue={hub}>
          {activeHubs.map((h) => (
            <option key={h.hub_id} value={h.hub_id}>
              Receiving at: {h.name}
            </option>
          ))}
        </select>
        <button type="submit">Change hub</button>
      </form>

      <form action={receiveCards} className={styles.list}>
        <input type="hidden" name="hub" value={hub} />
        <h2>Pending for this hub ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className={styles.muted}>No cards are pending for this hub.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th />
                <th>Serial</th>
                <th>Prism no.</th>
                <th>Sent to</th>
                <th>Expected</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i.item_id}>
                  <td>
                    <input type="checkbox" name="ids" value={i.item_id} aria-label={`Select ${i.item_id}`} />
                  </td>
                  <td>{i.item_id}</td>
                  <td>{i.prism_no}</td>
                  <td>{personName.get(i.current_holder) ?? (i.current_holder || "Any IM at this hub")}</td>
                  <td>{i.expected_return || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <textarea
          name="scanned"
          rows={8}
          autoFocus
          placeholder="Scan cards here, one per line"
          className={styles.textarea}
        />
        <div className={styles.row}>
          <input name="expected" type="number" min="0" placeholder="Expected count (optional)" />
          <input name="note" placeholder="Note (optional)" />
          <button type="submit">Receive cards</button>
        </div>
        <Link href="/handover/send">Send cards instead →</Link>
      </form>
    </main>
  );
}
