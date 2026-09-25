import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { ROLE_LABELS, STATUS_LABELS, one } from "@/lib/labels";
import type { Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import styles from "../form.module.css";
import { sendCards } from "../actions";

export default async function SendPage({ searchParams }: PageProps<"/handover/send">) {
  await requireRole("admin", "im");
  const sp = await searchParams;
  const store = getStore();
  const [people, hubs] = await Promise.all([store.list("people"), store.list("hubs")]);
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const recipients = people.filter((p) => p.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const activeHubs = hubs.filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const today = new Date().toISOString().slice(0, 10);

  const toPerson = people.find((p) => p.person_id === one(sp.person))?.name ?? one(sp.person);
  const toHubName = hubName.get(one(sp.hub)) ?? one(sp.hub);
  const status = STATUS_LABELS[one(sp.status) as Status] ?? one(sp.status);

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Send cards</h1>
      {one(sp.done) && (
        <p className={styles.ok}>
          Sent {one(sp.done)} card(s) to {toPerson || `${toHubName} hub`}. Status: {status}.
        </p>
      )}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <form action={sendCards} className={styles.form}>
        {/* The two radios come first so CSS can show the matching field with the sibling selector. */}
        <input type="radio" name="mode" value="person" id="mode-person" className={`${styles.modeInput} ${styles.modePerson}`} defaultChecked />
        <input type="radio" name="mode" value="hub" id="mode-hub" className={`${styles.modeInput} ${styles.modeHub}`} />

        <div className={styles.field}>
          <label className={styles.label} htmlFor="scanned">
            Cards
          </label>
          <div className={styles.control}>
            <textarea
              id="scanned"
              name="scanned"
              rows={8}
              autoFocus
              placeholder="Scan cards here. The scanner types each code and presses Enter."
              className={styles.textarea}
            />
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Send to</span>
          <div className={styles.control}>
            <div className={styles.segmented}>
              <label htmlFor="mode-person" className={styles.segPerson}>
                Person
              </label>
              <label htmlFor="mode-hub" className={styles.segHub}>
                Location
              </label>
            </div>
          </div>
        </div>

        <div className={`${styles.field} ${styles.personField}`}>
          <label className={styles.label} htmlFor="recipient">
            Person
          </label>
          <div className={styles.control}>
            <select id="recipient" name="recipient" defaultValue="">
              <option value="" disabled>
                Select a person
              </option>
              {recipients.map((p) => (
                <option key={p.person_id} value={p.person_id}>
                  {p.name} ({ROLE_LABELS[p.role]}, {hubName.get(p.hub) ?? p.hub})
                </option>
              ))}
            </select>
            <p className={styles.hint}>IM: waits to be received. IFO: traveling. FO: in the field. Rig: with rig team.</p>
          </div>
        </div>

        <div className={`${styles.field} ${styles.hubField}`}>
          <label className={styles.label} htmlFor="hub">
            Location
          </label>
          <div className={styles.control}>
            <select id="hub" name="hub" defaultValue="">
              <option value="" disabled>
                Select a hub
              </option>
              {activeHubs.map((h) => (
                <option key={h.hub_id} value={h.hub_id}>
                  {h.name}
                </option>
              ))}
            </select>
            <p className={styles.hint}>Cards wait at that hub until any IM there receives them.</p>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="checkoutDate">
            Checkout date
          </label>
          <div className={styles.control}>
            <input id="checkoutDate" name="checkoutDate" type="date" defaultValue={today} max={today} required />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="expectedReturn">
            Expected check-in date
          </label>
          <div className={styles.control}>
            <input id="expectedReturn" name="expectedReturn" type="date" min={today} />
            <p className={styles.hint}>Optional. The dashboard flags cards that are still out after this date.</p>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="note">
            Notes
          </label>
          <div className={styles.control}>
            <textarea id="note" name="note" rows={3} className={styles.textarea} />
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit">Send cards</button>
          <Link href="/handover/receive">Receive cards instead →</Link>
        </div>
      </form>
    </main>
  );
}
