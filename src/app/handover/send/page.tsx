import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { ROLE_LABELS, STATUS_LABELS, one } from "@/lib/labels";
import type { Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import styles from "../../admin/admin.module.css";
import { sendCards } from "../actions";

export default async function SendPage({ searchParams }: PageProps<"/handover/send">) {
  await requireRole("admin", "im");
  const sp = await searchParams;
  const store = getStore();
  const [people, hubs] = await Promise.all([store.list("people"), store.list("hubs")]);
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const recipients = people.filter((p) => p.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const toName = recipients.find((p) => p.person_id === one(sp.to))?.name ?? one(sp.to);

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Send cards</h1>
      <p className={styles.muted}>
        Hand in-stock cards to an IM (pending until they receive), an IFO (traveling), an FO or the rig
        team. Scan the QR codes into the box, one per line.
      </p>
      {one(sp.done) && (
        <p className={styles.ok}>
          Sent {one(sp.done)} card(s) to {toName}. Status: {STATUS_LABELS[one(sp.status) as Status] ?? one(sp.status)}.
        </p>
      )}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <form action={sendCards} className={styles.list}>
        <select name="recipient" defaultValue="" required>
          <option value="" disabled>
            Send to…
          </option>
          {recipients.map((p) => (
            <option key={p.person_id} value={p.person_id}>
              {p.name} ({ROLE_LABELS[p.role]}, {hubName.get(p.hub) ?? p.hub})
            </option>
          ))}
        </select>
        <textarea
          name="scanned"
          rows={12}
          autoFocus
          placeholder="Scan cards here (the scanner types each code and presses Enter)"
          className={styles.textarea}
        />
        <input name="note" placeholder="Note (optional)" />
        <div className={styles.row}>
          <button type="submit">Send cards</button>
          <Link href="/handover/receive">Receive cards instead →</Link>
        </div>
      </form>
    </main>
  );
}
