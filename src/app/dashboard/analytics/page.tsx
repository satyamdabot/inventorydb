import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { LATE_AFTER_HOURS, computeDashboard } from "@/lib/dashboard";
import { ROLE_LABELS, STATUS_LABELS, one } from "@/lib/labels";
import type { Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import { ActivityChart, BarList, n } from "../charts";
import styles from "../dashboard.module.css";

const RANGES = [7, 30, 90];

const inventory = (params: Record<string, string>) => `/inventory?${new URLSearchParams(params)}`;
const days = (d: number | null) => (d === null ? "—" : d === 0 ? "today" : `${d}d`);

// Tiles for the states an admin watches. Problem states carry an icon and a label, never color alone.
const TILES: { status: Status; icon?: { glyph: string; tone: "critical" | "warning" | "muted" } }[] = [
  { status: "in_stock" },
  { status: "with_fo" },
  { status: "traveling" },
  { status: "with_rig" },
  { status: "with_internal" },
  { status: "pending" },
  { status: "lost", icon: { glyph: "✕", tone: "critical" } },
  { status: "damaged", icon: { glyph: "▲", tone: "warning" } },
  { status: "retired", icon: { glyph: "●", tone: "muted" } },
];
const TONE = { critical: styles.iconCritical, warning: styles.iconWarning, muted: styles.iconMuted };

export default async function AnalyticsPage({ searchParams }: PageProps<"/dashboard/analytics">) {
  await requireRole();
  const sp = await searchParams;
  const store = getStore();
  const [items, events, people, hubs] = await Promise.all([
    store.list("items"),
    store.list("events"),
    store.list("people"),
    store.list("hubs"),
  ]);

  const hub = hubs.some((h) => h.hub_id === one(sp.hub)) ? one(sp.hub) : "";
  const period = one(sp.days);
  const isYesterday = period === "yesterday";
  const range = isYesterday ? 1 : RANGES.includes(Number(period)) ? Number(period) : 30;
  const d = computeDashboard(items, events, people, hubs, {
    hub,
    days: range,
    now: new Date(),
    endOffsetDays: isYesterday ? 1 : 0,
  });
  const hubScope: Record<string, string> = hub ? { hub } : {};
  const scopeName = hub ? (hubs.find((h) => h.hub_id === hub)?.name ?? hub) : "all hubs";

  const statusRows = TILES.map((t) => t.status)
    .filter((s) => d.byStatus[s] > 0)
    .sort((a, b) => d.byStatus[b] - d.byStatus[a])
    .map((s) => ({
      key: s,
      label: STATUS_LABELS[s],
      value: d.byStatus[s],
      href: inventory({ status: s, ...hubScope }),
      tip: `${STATUS_LABELS[s]}\n${n(d.byStatus[s])} items (${((d.byStatus[s] / Math.max(1, d.total)) * 100).toFixed(1)}%)`,
    }));

  return (
    <div className={styles.root}>
      <main className={styles.wrap}>
        <p className={styles.back}>
          <Link href="/dashboard">← Dashboard</Link>
        </p>
        <h1>More analytics</h1>

        <form className={styles.filters} method="get">
          <select name="hub" defaultValue={hub} aria-label="Hub">
            <option value="">All hubs</option>
            {[...hubs]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((h) => (
                <option key={h.hub_id} value={h.hub_id}>
                  {h.name}
                </option>
              ))}
          </select>
          <select name="days" defaultValue={isYesterday ? "yesterday" : String(range)} aria-label="Activity period">
            <option value="yesterday">Activity: yesterday</option>
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Activity: last {r} days
              </option>
            ))}
          </select>
          <button type="submit">Apply</button>
          {(hub || isYesterday || range !== 30) && (
            <Link href="/dashboard/analytics" className={styles.link}>
              Reset
            </Link>
          )}
        </form>

        <section className={styles.card} aria-label="Overview">
          <div className={styles.hero}>
            <div>
              <div className={styles.heroValue}>{n(d.total)}</div>
              <div className={styles.heroLabel}>
                {hub ? `items currently at ${scopeName}` : "items in total"}
              </div>
            </div>
            <div className={styles.heroSide}>
              <div>
                <strong>{n(d.outCount)}</strong>
                <span>out with someone</span>
              </div>
              <div>
                <strong>{n(d.lateCards)}</strong>
                <span>late (over {LATE_AFTER_HOURS} hours)</span>
              </div>
            </div>
          </div>
          <div className={styles.tiles}>
            {TILES.map(({ status, icon }) => (
              <Link key={status} href={inventory({ status, ...hubScope })} className={styles.tile}>
                <span className={styles.tileLabel}>
                  {icon && (
                    <span className={`${styles.icon} ${TONE[icon.tone]}`} aria-hidden>
                      {icon.glyph}
                    </span>
                  )}
                  {STATUS_LABELS[status]}
                </span>
                <span className={styles.tileValue}>{n(d.byStatus[status])}</span>
              </Link>
            ))}
          </div>
        </section>

        <div className={styles.grid2}>
          <section className={styles.card} aria-label="Where items are now">
            <h2>Where items are now</h2>
            {statusRows.length ? <BarList rows={statusRows} /> : <p className={styles.muted}>No items.</p>}
          </section>
          <section className={styles.card} aria-label="Items moved per day">
            <h2>{isYesterday ? "Items moved yesterday" : "Items moved per day"}</h2>
            <ActivityChart days={d.activity} />
          </section>
        </div>

        {!hub && (
          <section className={styles.card} aria-label="Items by hub">
            <h2>Items by hub</h2>
            <p className={styles.muted}>
              Owned is the home hub. Held is where the item is now. Net is held minus owned: positive means
              the hub is holding other hubs&apos; items.
            </p>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Hub</th>
                    <th className={styles.num}>Owned</th>
                    <th className={styles.num}>Held</th>
                    <th className={styles.num}>In stock</th>
                    <th className={styles.num}>Out</th>
                    <th className={styles.num}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {d.hubs.map((h) => (
                    <tr key={h.hub_id}>
                      <td>
                        <Link href={inventory({ hub: h.hub_id })}>{h.name}</Link>
                      </td>
                      <td className={styles.num}>{n(h.owned)}</td>
                      <td className={styles.num}>{n(h.held)}</td>
                      <td className={styles.num}>{n(h.inStock)}</td>
                      <td className={styles.num}>{n(h.out)}</td>
                      <td className={styles.num}>{h.held - h.owned > 0 ? "+" : ""}{n(h.held - h.owned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className={styles.grid2}>
          <section className={styles.card} aria-label="Who has items">
            <h2>Who has items</h2>
            {d.holders.length === 0 ? (
              <p className={styles.muted}>Nothing is out right now.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th className={styles.num}>Items</th>
                      <th className={styles.num}>Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.holders.map((h) => (
                      <tr key={h.person_id}>
                        <td>
                          <Link href={inventory({ holder: h.person_id })}>{h.name}</Link>
                          {h.role && <span className={styles.muted}> · {ROLE_LABELS[h.role]}</span>}
                        </td>
                        <td className={styles.num}>{n(h.count)}</td>
                        <td className={styles.num}>{days(h.oldestDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.card} aria-label="Waiting to be received">
            <h2>Waiting to be received</h2>
            {d.pending.length === 0 ? (
              <p className={styles.muted}>No pending handovers.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Receiving hub</th>
                      <th className={styles.num}>Items</th>
                      <th className={styles.num}>Waiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pending.map((p) => (
                      <tr key={p.hub_id}>
                        <td>
                          <Link href={`/handover/receive?${new URLSearchParams({ hub: p.hub_id })}`}>{p.name}</Link>
                        </td>
                        <td className={styles.num}>{n(p.count)}</td>
                        <td className={styles.num}>{days(p.oldestDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className={styles.card} aria-label="Longest out">
          <h2>Longest out</h2>
          <p className={styles.muted}>Items not in stock, oldest first. Days since their last recorded movement.</p>
          {d.longestOut.length === 0 ? (
            <p className={styles.muted}>Nothing is out right now.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Serial</th>
                    <th>Status</th>
                    <th>Holder</th>
                    <th>Hub</th>
                    <th className={styles.num}>Days out</th>
                  </tr>
                </thead>
                <tbody>
                  {d.longestOut.map((r) => (
                    <tr key={r.item_id}>
                      <td>
                        <Link href={`/inventory/${r.item_id}`}>{r.item_id}</Link>
                      </td>
                      <td>{STATUS_LABELS[r.status]}</td>
                      <td>{r.holder}</td>
                      <td>{r.hub}</td>
                      <td className={styles.num}>{days(r.days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.card} aria-label="Data health">
          <h2>Data health</h2>
          {d.inconsistencies.length === 0 ? (
            <p className={styles.ok}>
              <span className={`${styles.icon} ${styles.iconGood}`} aria-hidden>
                ✓
              </span>{" "}
              Every item with history matches its latest event.
            </p>
          ) : (
            <div>
              <p className={styles.warn}>
                <span className={`${styles.icon} ${styles.iconCritical}`} aria-hidden>
                  ✕
                </span>{" "}
                {d.inconsistencies.length} item(s) don&apos;t match their latest event. Fix them with a correction on
                the item page.
              </p>
              <ul className={styles.list}>
                {d.inconsistencies.slice(0, 20).map((p) => (
                  <li key={p.item_id}>
                    <Link href={`/inventory/${p.item_id}`}>{p.item_id}</Link>: {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.noHistory > 0 && (
            <p className={styles.muted}>
              {n(d.noHistory)} item(s) have no history yet. It starts with their first handover or correction.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
