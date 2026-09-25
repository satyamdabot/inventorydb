import Link from "next/link";
import { actorOptions, defaultActor } from "@/lib/actors";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS, one } from "@/lib/labels";
import type { Role, Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import styles from "../form.module.css";
import { sendCards } from "../actions";
import ScanBox from "../ScanBox";

// The Send to list, grouped so it is easy to scan. What each group means is in the hint under the field.
const GROUPS: { role: Role; label: string }[] = [
  { role: "im", label: "Inventory managers (IM)" },
  { role: "ifo", label: "Couriers (IFO)" },
  { role: "fo", label: "Field officers (FO)" },
  { role: "rig", label: "Rig team" },
];

export default async function SendPage({ searchParams }: PageProps<"/handover/send">) {
  const user = await requireRole("admin", "im");
  const sp = await searchParams;
  const store = getStore();
  const [people, hubs, users, items] = await Promise.all([
    store.list("people"),
    store.list("hubs"),
    store.list("users"),
    store.list("items"),
  ]);
  const scanItems = items.map((i) => ({ id: i.item_id, status: i.status }));
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const recipients = people.filter((p) => p.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const byOptions = actorOptions(people, users, (id) => hubName.get(id) ?? id);
  const activeHubs = hubs.filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));

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
          <label className={styles.label} htmlFor="by">
            Sent by
          </label>
          <div className={styles.control}>
            <select id="by" name="by" defaultValue={defaultActor(user)} required>
              {byOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={styles.hint}>Defaults to you. Your own sign-in is always saved on the record as well.</p>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="scanned">
            Cards
          </label>
          <div className={styles.control}>
            <ScanBox id="scanned" mode="send" items={scanItems} />
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
              {GROUPS.map((g) => {
                const inGroup = recipients.filter((p) => p.role === g.role);
                return inGroup.length ? (
                  <optgroup key={g.role} label={g.label}>
                    {inGroup.map((p) => (
                      <option key={p.person_id} value={p.person_id}>
                        {p.name} ({hubName.get(p.hub) ?? p.hub})
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
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
          <label className={styles.label} htmlFor="note">
            Notes
          </label>
          <div className={styles.control}>
            <textarea id="note" name="note" rows={3} className={styles.textarea} />
            <p className={styles.hint}>The checkout date and time are recorded automatically when you press Send.</p>
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
