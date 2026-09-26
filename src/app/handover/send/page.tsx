import Link from "next/link";
import { actorOptions, allowedActors, defaultActor } from "@/lib/actors";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS, one } from "@/lib/labels";
import type { Role, Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import styles from "../form.module.css";
import { sendCards } from "../actions";
import SendScanFields from "./SendScanFields";
import SendToFields from "./SendToFields";

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
  const scanItems = items.map((i) => ({ id: i.item_id, status: i.status, hub: i.current_hub }));
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const recipients = people.filter((p) => p.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const byOptions = allowedActors(user, actorOptions(people, users, (id) => hubName.get(id) ?? id));
  const activeHubs = hubs.filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));

  // Start at the IM's own hub. Someone with no hub (an admin) starts where most cards are in stock.
  const stockByHub = new Map<string, number>();
  for (const i of items) if (i.status === "in_stock") stockByHub.set(i.current_hub, (stockByHub.get(i.current_hub) ?? 0) + 1);
  const fullest = [...stockByHub.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const isActive = (id?: string) => !!id && activeHubs.some((h) => h.hub_id === id);
  const myHub = people.find((p) => p.person_id === user.personId)?.hub;
  const defaultFromHub = isActive(myHub)
    ? myHub!
    : isActive(fullest)
      ? fullest!
      : (activeHubs.find((h) => h.is_central === "true")?.hub_id ?? activeHubs[0]?.hub_id ?? "");

  // Categories with the people in each, for the two-step picker. Empty categories are left out.
  const personGroups = GROUPS.map((g) => ({
    role: g.role,
    label: g.label,
    people: recipients
      .filter((p) => p.role === g.role)
      .map((p) => ({ id: p.person_id, label: `${p.name} (${hubName.get(p.hub) ?? p.hub})` })),
  })).filter((g) => g.people.length > 0);

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
          Sent {one(sp.done)} card(s) to {toPerson} at {toHubName}. Status: {status}.
        </p>
      )}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <form action={sendCards} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="by">
            Sent by
          </label>
          <div className={styles.control}>
            {user.role === "admin" ? (
              <>
                <select id="by" name="by" defaultValue={defaultActor(user)} required>
                  {byOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className={styles.hint}>
                  As an admin you can send on behalf of anyone. Your own sign-in is always saved on the record too.
                </p>
              </>
            ) : byOptions.length ? (
              <>
                <strong id="by">{byOptions[0].label}</strong>
                <p className={styles.hint}>Handovers are recorded under your name.</p>
              </>
            ) : (
              <p className={styles.error}>
                Your login is not linked to an active IM, so you can&apos;t send yet. Ask an admin to link you on the Users screen.
              </p>
            )}
          </div>
        </div>

        <SendScanFields
          hubs={activeHubs.map((h) => ({ id: h.hub_id, name: h.name }))}
          defaultHub={defaultFromHub}
          items={scanItems}
        />

        <SendToFields groups={personGroups} hubs={activeHubs.map((h) => ({ id: h.hub_id, name: h.name }))} />

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
