import Link from "next/link";
import { actorOptions, allowedActors, defaultActor } from "@/lib/actors";
import { requireRole } from "@/lib/authz";
import { one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import styles from "../../admin/admin.module.css";
import { receiveCards } from "../actions";
import HubSelect from "./HubSelect";
import ReceiveScanArea from "./ReceiveScanArea";

export default async function ReceivePage({ searchParams }: PageProps<"/handover/receive">) {
  const user = await requireRole("admin", "im", "rig");
  const sp = await searchParams;
  const store = getStore();
  const [items, hubs, people, users] = await Promise.all([
    store.list("items"),
    store.list("hubs"),
    store.list("people"),
    store.list("users"),
  ]);
  const activeHubs = hubs.filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const hubNames = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const byOptions = allowedActors(user, actorOptions(people, users, (id) => hubNames.get(id) ?? id));

  // Cards waiting to be received, per hub they were sent to.
  const pendingByHub = new Map<string, number>();
  for (const i of items) if (i.status === "pending") pendingByHub.set(i.current_hub, (pendingByHub.get(i.current_hub) ?? 0) + 1);
  const busiest = [...pendingByHub.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Default: the signed-in IM's own hub. Someone with no hub (an admin) starts where cards are waiting,
  // else at the central hub.
  const isActive = (id?: string) => !!id && activeHubs.some((h) => h.hub_id === id);
  const myHub = people.find((p) => p.person_id === user.personId)?.hub;
  const hub = isActive(one(sp.hub))
    ? one(sp.hub)
    : isActive(myHub)
      ? myHub!
      : isActive(busiest)
        ? busiest!
        : (activeHubs.find((h) => h.is_central === "true")?.hub_id ?? activeHubs[0]?.hub_id ?? "");
  const waitingElsewhere = [...pendingByHub.entries()].filter(([id]) => id !== hub);

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Receive cards</h1>
      <p className={styles.muted}>
        Take cards into stock at a hub: cards sent to it, or cards coming back from an IFO, FO or the rig
        team. Scan the QR codes into the box.
      </p>
      <form method="get" className={styles.row}>
        <HubSelect hubs={activeHubs.map((h) => ({ id: h.hub_id, name: h.name }))} value={hub} />
        <noscript>
          <button type="submit">Change hub</button>
        </noscript>
      </form>
      <p className={styles.muted}>Choose the hub first, then scan. Cards sent to a hub can only be received there.</p>
      {waitingElsewhere.length > 0 && (
        <p className={styles.muted}>
          Also waiting at other hubs:{" "}
          {waitingElsewhere.map(([id, count], i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link href={`/handover/receive?${new URLSearchParams({ hub: id })}`}>
                {hubNames.get(id) ?? id} ({count})
              </Link>
            </span>
          ))}
        </p>
      )}

      <form action={receiveCards} className={styles.list}>
        <input type="hidden" name="hub" value={hub} />
        <ReceiveScanArea
          hub={hub}
          hubNames={Object.fromEntries(hubNames)}
          items={items.map((i) => ({ id: i.item_id, status: i.status, hub: i.current_hub }))}
        />
        <div className={styles.row}>
          {user.role === "admin" ? (
            <select name="by" defaultValue={defaultActor(user)} aria-label="Received by" required>
              {byOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  Received by: {o.label}
                </option>
              ))}
            </select>
          ) : byOptions.length ? (
            <span>
              Received by: <strong>{byOptions[0].label}</strong>
            </span>
          ) : (
            <span className={styles.error}>Your login is not linked to an active IM or rig team member. Ask an admin to link you.</span>
          )}
          <input name="expected" type="number" min="0" placeholder="Expected count (optional)" />
          <input name="note" placeholder="Note (optional)" />
          <button type="submit">Receive cards</button>
        </div>

        {one(sp.done) && <p className={styles.ok}>Received {one(sp.done)} card(s) into stock.</p>}
        {one(sp.mismatch) && <p className={styles.error}>{one(sp.mismatch)} It was recorded on each card&apos;s history.</p>}
        {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

        <Link href="/handover/send">Send cards instead →</Link>
      </form>
    </main>
  );
}
