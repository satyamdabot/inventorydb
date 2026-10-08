import Link from "next/link";
import {
  actorOptions,
  allowedActors,
  defaultActor,
} from "@/lib/actors";
import { requireRole } from "@/lib/authz";
import { ROLE_LABELS, one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import styles from "../../admin/admin.module.css";
import { receiveCards } from "../actions";
import HubSelect from "./HubSelect";
import ReceiveScanArea from "./ReceiveScanArea";

export default async function ReceivePage({
  searchParams,
}: PageProps<"/handover/receive">) {
  const user = await requireRole("admin", "im", "rig");
  const sp = await searchParams;
  const store = getStore();

  const [items, hubs, people, users] = await Promise.all([
    store.list("items"),
    store.list("hubs"),
    store.list("people"),
    store.list("users"),
  ]);

  const activeHubs = hubs
    .filter((h) => h.active !== "false")
    .sort((a, b) => a.name.localeCompare(b.name));

  const hubNames = new Map(
    hubs.map((h) => [h.hub_id, h.name])
  );

  // Existing rules determine who can record this receipt.
  const byOptions = allowedActors(
    user,
    actorOptions(
      people,
      users,
      (id) => hubNames.get(id) ?? id
    )
  );

  // Receive-from options identify people returning items.
  // This is different from the person recording the receipt.
  const receiveFromOptions = [...people]
    .filter((person) => person.active !== "false")
    .sort((a, b) => a.name.localeCompare(b.name));

  // Count items pending receipt at each hub.
  const pendingByHub = new Map<string, number>();

  for (const item of items) {
    if (item.status === "pending") {
      pendingByHub.set(
        item.current_hub,
        (pendingByHub.get(item.current_hub) ?? 0) + 1
      );
    }
  }

  const busiest = [...pendingByHub.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Keep the existing receiving-hub default logic.
  const isActive = (id?: string) =>
    Boolean(id) &&
    activeHubs.some((h) => h.hub_id === id);

  const myHub = people.find(
    (person) => person.person_id === user.personId
  )?.hub;

  const requestedHub = one(sp.hub);

  const hub = isActive(requestedHub)
    ? requestedHub
    : isActive(myHub)
      ? myHub!
      : isActive(busiest)
        ? busiest!
        : (
            activeHubs.find(
              (h) => h.is_central === "true"
            )?.hub_id ??
            activeHubs[0]?.hub_id ??
            ""
          );

  const waitingElsewhere = [...pendingByHub.entries()]
    .filter(([id]) => id !== hub);

  const preferredActor = defaultActor(user);

  const selectedActor = byOptions.some(
    (option) => option.value === preferredActor
  )
    ? preferredActor
    : (byOptions[0]?.value ?? "");

  const canReceive = Boolean(hub) && byOptions.length > 0;

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>

      <h1>Receive items</h1>

      <p className={styles.muted}>
        Take items into stock at a hub: items sent to it, or
        items coming back from an IFO, FO or the rig team.
        Scan the QR codes into the box.
      </p>

      {/* Receiving location selection. */}
      <form method="get" className={styles.row}>
        <HubSelect
          hubs={activeHubs.map((h) => ({
            id: h.hub_id,
            name: h.name,
          }))}
          value={hub}
        />

        <noscript>
          <button type="submit">Change hub</button>
        </noscript>
      </form>

      <p className={styles.muted}>
        Choose the hub first, then scan. Items sent to a hub
        can only be received there.
      </p>

      {!hub && (
        <p className={styles.error}>
          No active receiving hub is available. Ask an
          administrator to configure a hub.
        </p>
      )}

      {waitingElsewhere.length > 0 && (
        <p className={styles.muted}>
          Also waiting at other hubs:{" "}
          {waitingElsewhere.map(([id, count], index) => (
            <span key={id}>
              {index > 0 && ", "}

              <Link
                href={`/handover/receive?${new URLSearchParams({
                  hub: id,
                })}`}
              >
                {hubNames.get(id) ?? id} ({count})
              </Link>
            </span>
          ))}
        </p>
      )}

      <form action={receiveCards} className={styles.list}>
        <input type="hidden" name="hub" value={hub} />

        {/* Existing scan and batch-receipt interface. */}
        <ReceiveScanArea
          hub={hub}
          hubNames={Object.fromEntries(hubNames)}
          items={items.map((item) => ({
            id: item.item_id,
            status: item.status,
            hub: item.current_hub,
          }))}
        />

        {/* NEW: Receive from, placed after the scanning component.
            The receiving action must be updated before this
            selection can affect saved receipt/history records. */}
        <section
          aria-label="Receive from"
          style={{
            marginTop: 16,
            marginBottom: 16,
            padding: 16,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
          }}
        >
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              Receive from
            </span>

            <select
              name="receiveFrom"
              defaultValue=""
              disabled={receiveFromOptions.length === 0}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #94a3b8",
                borderRadius: 6,
              }}
            >
              <option value="">
                Select the person returning the items
              </option>

              {receiveFromOptions.map((person) => (
                <option
                  key={person.person_id}
                  value={person.person_id}
                >
                  {person.name}
                  {" · "}
                  {ROLE_LABELS[person.role] ?? person.role}
                  {" · "}
                  {hubNames.get(person.hub) ?? person.hub}
                </option>
              ))}
            </select>
          </label>

          {receiveFromOptions.length === 0 && (
            <p className={styles.muted}>
              No active people are available.
            </p>
          )}

          <p className={styles.muted}>
            This selection is not yet connected to receipt
            history. Receiving continues to use the existing
            item and handover rules.
          </p>
        </section>

        {/* Received by identifies who records this transaction. */}
        <div className={styles.row}>
          {user.role === "admin" ? (
            <select
              name="by"
              defaultValue={selectedActor}
              aria-label="Received by"
              required
            >
              {byOptions.length === 0 && (
                <option value="">
                  No eligible recorder available
                </option>
              )}

              {byOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  Received by: {option.label}
                </option>
              ))}
            </select>
          ) : byOptions.length ? (
            <span>
              Received by:{" "}
              <strong>{byOptions[0].label}</strong>
            </span>
          ) : (
            <span className={styles.error}>
              Your login is not linked to an active IM or rig
              team member. Ask an admin to link you.
            </span>
          )}

          <input
            name="expected"
            type="number"
            min="0"
            step="1"
            placeholder="Expected count (optional)"
            aria-label="Expected count"
          />

          <input
            name="note"
            placeholder="Note (optional)"
            aria-label="Note"
          />

          <button type="submit" disabled={!canReceive}>
            Receive items
          </button>
        </div>

        {one(sp.done) && (
          <p className={styles.ok} role="status">
            Received {one(sp.done)} item(s) into stock.
          </p>
        )}

        {one(sp.mismatch) && (
          <p className={styles.error} role="alert">
            {one(sp.mismatch)} It was recorded on each
            item&apos;s history.
          </p>
        )}

        {one(sp.error) && (
          <p className={styles.error} role="alert">
            {one(sp.error)}
          </p>
        )}

        <Link href="/handover/send">
          Send items instead →
        </Link>
      </form>
    </main>
  );
}