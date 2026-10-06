import Link from "next/link";
import type { CSSProperties } from "react";
import { requireRole } from "@/lib/authz";
import { LATE_AFTER_HOURS, computeDashboard } from "@/lib/dashboard";
import { buildHubTree } from "@/lib/hub-tree";
import { ROLE_LABELS, STATUS_LABELS, one } from "@/lib/labels";
import type { Status } from "@/lib/schema";
import { getStore } from "@/lib/store";
import { ActivityChart, BarList, n } from "./charts";
import styles from "./dashboard.module.css";
import { HubOrgChart, countHidden } from "./hub-tree-view";
import { Icon, type IconName } from "./icons";
import { SummaryKpis } from "./summary-kpis";

const inventory = (params: Record<string, string>) => `/inventory?${new URLSearchParams(params)}`;
const days = (d: number | null) => (d === null ? "—" : d === 0 ? "today" : `${d}d`);
const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

interface Attention {
  key: string;
  text: string;
  href: string;
  tone: "critical" | "warning" | "info";
}
const GLYPH = { critical: "✕", warning: "▲", info: "●" } as const;
const TONE = { critical: styles.iconCritical, warning: styles.iconWarning, info: styles.iconMuted };

const STATUS_ORDER: Status[] = ["in_stock", "with_fo", "traveling", "with_rig", "with_internal", "pending", "lost", "damaged", "retired"];
const HUB_BARS = 8;
const LATE_LINES = 8; // late lines shown before "and N more"
const HOLDER_ROWS = 7; // holder rows shown, by most cards held

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireRole();
  const sp = await searchParams;
  const store = getStore();
  const [items, events, people, hubs] = await Promise.all([
    store.list("items"),
    store.list("events"),
    store.list("people"),
    store.list("hubs"),
  ]);

  const d = computeDashboard(items, events, people, hubs, { hub: "", days: 14, now: new Date() });
  const tree = buildHubTree(hubs, items);
  const showEmpty = one(sp.empty) === "1";
  const hiddenEmpty = countHidden(tree, false);
  const canHandle = user.role === "admin" || user.role === "im" || user.role === "rig";
  const activeHubs = hubs.filter((h) => h.active !== "false").length;

  const s = d.byStatus;
  const share = (v: number) => (d.total ? `${Math.round((v / d.total) * 100)}% of all items` : "");
  const kpis: { label: string; value: number; hint: string; href: string; icon: IconName; color: string }[] = [
    { label: "In stock", value: s.in_stock, hint: share(s.in_stock), href: inventory({ status: "in_stock" }), icon: "check", color: "var(--series-3)" },
    { label: "With field officers", value: s.with_fo, hint: share(s.with_fo), href: inventory({ status: "with_fo" }), icon: "user", color: "var(--series-2)" },
    { label: "With rig team", value: s.with_rig, hint: share(s.with_rig), href: inventory({ status: "with_rig" }), icon: "database", color: "var(--series-7)" },
    { label: "Internal", value: s.with_internal, hint: share(s.with_internal), href: inventory({ status: "with_internal" }), icon: "user", color: "var(--series-1)" },
    {
      label: "In transit",
      value: s.traveling + s.pending,
      hint: "traveling or waiting",
      href: inventory({ status: "traveling,pending" }),
      icon: "truck",
      color: "var(--series-4)",
    },
    {
      label: "Lost or damaged",
      value: s.lost + s.damaged,
      hint: "need follow-up",
      href: inventory({ status: "lost,damaged" }),
      icon: "alert",
      color: "var(--critical)",
    },
  ];

  // Bars: one series, one colour. Every bar opens the matching list or hub.
  const statusRows = STATUS_ORDER.filter((st) => s[st] > 0)
    .sort((a, b) => s[b] - s[a])
    .map((st) => ({
      key: st,
      label: STATUS_LABELS[st],
      value: s[st],
      href: inventory({ status: st }),
      tip: `${STATUS_LABELS[st]}\n${n(s[st])} items (${((s[st] / Math.max(1, d.total)) * 100).toFixed(1)}%)`,
    }));

  const byHub = d.hubs.filter((h) => h.held > 0);
  const hubRows = byHub.slice(0, HUB_BARS).map((h) => ({
    key: h.hub_id,
    label: h.name,
    value: h.held,
    href: `/dashboard/hub/${h.hub_id}`,
    tip: `${h.name}\n${n(h.held)} items\n${n(h.byStatus.in_stock)} in stock`,
  }));
  const rest = byHub.slice(HUB_BARS);
  if (rest.length) {
    const total = rest.reduce((sum, h) => sum + h.held, 0);
    hubRows.push({ key: "other", label: `${rest.length} other hubs`, value: total, href: "/inventory", tip: `${rest.length} other hubs\n${n(total)} items` });
  }

  // Plain sentences about what to look at, most useful first. Empty means all is well.
  const attention: Attention[] = [];
  // Late cards, oldest first: an FO who has not returned cards, an IFO whose cards have not arrived, and cards
  // sent to a hub that nobody has received. One line per person or hub, so each says who to chase.
  const howLong = (hours: number) => (hours < 48 ? `${Math.floor(hours)} hours` : `${Math.floor(hours / 24)} days`);
  for (const g of d.late.slice(0, LATE_LINES)) {
    if (g.kind === "pending") {
      attention.push({
        key: `late-pending-${g.key}`,
        text: `${plural(g.count, "item")} sent to ${g.label} not received after ${LATE_AFTER_HOURS} hours, oldest ${howLong(g.oldestHours)}`,
        href: `/handover/receive?${new URLSearchParams({ hub: g.key })}`,
        tone: "warning",
      });
    } else {
      attention.push({
        key: `late-${g.kind}-${g.key}`,
        text: `${g.label} (${g.kind === "fo" ? "FO" : "IFO"}) has ${plural(g.count, "item")} ${g.kind === "fo" ? "not returned" : "not arrived"} after ${LATE_AFTER_HOURS} hours, longest ${howLong(g.oldestHours)}`,
        href: inventory({ holder: g.key, status: g.kind === "fo" ? "with_fo" : "traveling" }),
        tone: "warning",
      });
    }
  }
  if (d.late.length > LATE_LINES) {
    attention.push({
      key: "late-more",
      text: `and ${d.late.length - LATE_LINES} more late`,
      href: inventory({ status: "with_fo,traveling,pending" }),
      tone: "info",
    });
  }
  if (s.lost + s.damaged > 0) {
    attention.push({
      key: "problem",
      text: `${plural(s.lost, "item")} lost, ${plural(s.damaged, "item")} damaged`,
      href: inventory({ status: "lost,damaged" }),
      tone: "critical",
    });
  }
  if (d.inconsistencies.length > 0) {
    attention.push({
      key: "mismatch",
      text: `${plural(d.inconsistencies.length, "item")} don't match their history`,
      href: "/dashboard/analytics",
      tone: "critical",
    });
  }

  return (
    <div className={styles.root}>
      <main className={styles.wrap}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>
              <Icon name="layers" size={26} />
            </span>
            <div>
              <h1>Inventory Dashboard</h1>
              <p className={styles.subtitle}>
                {n(d.total)} items · {activeHubs} hubs · the latest known position of every item
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            {canHandle && (
              <>
                <Link href="/handover/send" className={`${styles.btn} ${styles.btnPrimary}`}>
                  <Icon name="send" size={16} /> Send items
                </Link>
                <Link href="/handover/receive" className={styles.btn}>
                  <Icon name="inbox" size={16} /> Receive items
                </Link>
              </>
            )}
            <Link href="/dashboard" className={styles.btn} title="Reload the latest numbers">
              <Icon name="refresh" size={16} /> Refresh
            </Link>
          </div>
        </div>

        <nav className={styles.tabs} aria-label="Sections">
          <span className={`${styles.tab} ${styles.tabOn}`} aria-current="page">
            Overview
          </span>
          <Link href="/dashboard/analytics" className={styles.tab}>
            Analytics
          </Link>
          <Link href="/inventory" className={styles.tab}>
            Inventory
          </Link>
          {user.role === "admin" && (
            <Link href="/admin/hubs" className={styles.tab}>
              Hubs
            </Link>
          )}
          <Link href="/" className={styles.tab}>
            Home
          </Link>
        </nav>

        <form action="/inventory" method="get" role="search" className={styles.search}>
          <Icon name="search" size={18} />
          <input name="q" placeholder="Find an item by serial, prism no., brand or model" aria-label="Find an item" />
        </form>

        <SummaryKpis d={d} />

        <section className={styles.kpiGrid} aria-label="Overview">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href} className={styles.kpi} style={{ "--kpi": k.color } as CSSProperties}>
              <span className={styles.kpiIcon}>
                <Icon name={k.icon} size={22} />
              </span>
              <span className={styles.kpiBody}>
                <span className={styles.kpiLabel}>{k.label}</span>
                <span className={styles.kpiValue}>{n(k.value)}</span>
                {k.hint && <span className={styles.kpiHint}>{k.hint}</span>}
              </span>
            </Link>
          ))}
        </section>

        <section className={styles.card} aria-label="Hub hierarchy">
          <div className={styles.sectionHead}>
            <h2>Hub hierarchy</h2>
            <span className={styles.muted}>Click a hub for everything about it</span>
          </div>
          <p className={styles.muted}>
            The main hub is at the top with the hubs under it. Each box shows the items the hub holds, including the
            hubs under it.
          </p>
          <HubOrgChart roots={tree} showEmpty={showEmpty} />
          {hiddenEmpty > 0 && !showEmpty && (
            <p className={styles.muted}>
              {hiddenEmpty} hub{hiddenEmpty === 1 ? "" : "s"} with no items {hiddenEmpty === 1 ? "is" : "are"} hidden.{" "}
              <Link href="/dashboard?empty=1" className={styles.link}>
                Show {hiddenEmpty === 1 ? "it" : "them"}
              </Link>
            </p>
          )}
          {showEmpty && (
            <p className={styles.muted}>
              <Link href="/dashboard" className={styles.link}>
                Hide hubs with no items
              </Link>
            </p>
          )}
        </section>

        <div className={styles.chartRow}>
          <section className={styles.card} aria-label="Items by status">
            <h2>Items by status</h2>
            {statusRows.length ? <BarList rows={statusRows} /> : <p className={styles.muted}>No items.</p>}
          </section>
          <section className={styles.card} aria-label="Items by hub">
            <h2>Items by hub</h2>
            {hubRows.length ? <BarList rows={hubRows} /> : <p className={styles.muted}>No items at any hub.</p>}
          </section>
        </div>

        <section className={styles.card} aria-label="Items moved per day">
          <div className={styles.sectionHead}>
            <h2>Items moved per day</h2>
            <span className={styles.muted}>Last 14 days</span>
          </div>
          <ActivityChart days={d.activity} />
        </section>

        <div className={styles.grid2}>
          <section className={styles.card} id="attention" aria-label="Needs attention">
            <h2>Needs attention</h2>
            <p className={styles.muted}>
              Items with an FO or IFO, or sent to a hub, for more than {LATE_AFTER_HOURS} hours, plus lost, damaged and
              mismatched items.
            </p>
            {attention.length === 0 ? (
              <p className={styles.ok}>
                <span className={`${styles.icon} ${styles.iconGood}`} aria-hidden>
                  ✓
                </span>{" "}
                Nothing needs attention right now.
              </p>
            ) : (
              <ul className={styles.attention}>
                {attention.map((a) => (
                  <li key={a.key}>
                    <span className={`${styles.icon} ${TONE[a.tone]}`} aria-hidden>
                      {GLYPH[a.tone]}
                    </span>
                    <Link href={a.href}>{a.text}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
  className={styles.card}
  aria-label="Who has items"
  style={{ minWidth: 0 }}
>
  <h2>Who has items</h2>

  <div
    className={styles.tableScroll}
    role="region"
    aria-label="Who has items — scrollable table"
    tabIndex={0}
    style={{
      maxHeight: "400px",
      maxWidth: "100%",
      overflowY: "auto",
      overflowX: "auto",
    }}
  >
    <table
      className={styles.table}
      style={{
        width: "100%",
        minWidth: "420px",
        borderCollapse: "separate",
        borderSpacing: 0,
      }}
    >
      <thead>
        <tr>
          <th
            scope="col"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              backgroundColor: "#1e293b",
              color: "#ffffff",
            }}
          >
            Person
          </th>

          <th
            scope="col"
            className={styles.num}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              backgroundColor: "#1e293b",
              color: "#ffffff",
            }}
          >
            Items
          </th>

          <th
            scope="col"
            className={styles.num}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              backgroundColor: "#1e293b",
              color: "#ffffff",
            }}
          >
            Longest
          </th>
        </tr>
      </thead>

      <tbody>
        {d.holders.length === 0 ? (
          <tr>
            <td colSpan={3} className={styles.muted}>
              Nothing is out right now.
            </td>
          </tr>
        ) : (
          d.holders.map((h) => (
            <tr key={h.person_id}>
              <td
                style={{
                  whiteSpace: "normal",
                  overflow: "visible",
                  overflowWrap: "anywhere",
                }}
              >
                <Link
                  href={inventory({ holder: h.person_id })}
                  style={{
                    display: "block",
                    whiteSpace: "normal",
                    overflow: "visible",
                    textOverflow: "clip",
                    overflowWrap: "anywhere",
                    maxWidth: "none",
                  }}
                >
                  {h.name}
                </Link>

                {h.role && (
                  <span
                    className={styles.muted}
                    style={{ display: "block", marginTop: 4 }}
                  >
                    {ROLE_LABELS[h.role]}
                  </span>
                )}
              </td>

              <td className={styles.num}>{n(h.count)}</td>

              <td className={styles.num}>
                {days(h.oldestDays)}
              </td>
            </tr>A
          ))
        )}
      </tbody>

      <tfoot style={{ position: "static" }}>
        <tr>
          <th
            scope="row"
            style={{
              position: "static",
              textAlign: "left",
              borderTop: "2px solid #64748b",
              backgroundColor: "#1e293b",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            Grand total
          </th>

          <td
            className={styles.num}
            style={{
              position: "static",
              borderTop: "2px solid #64748b",
              backgroundColor: "#1e293b",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            {n(
              d.holders.reduce(
                (total, holder) => total + holder.count,
                0
              )
            )}
          </td>

          <td
            className={styles.num}
            style={{
              position: "static",
              borderTop: "2px solid #64748b",
              backgroundColor: "#1e293b",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            —
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</section>
        </div>

        <p className={styles.muted}>
          <Link href="/dashboard/analytics" className={styles.link}>
            More analytics
          </Link>{" "}
          — hub owned vs held, longest out, data health.
        </p>
      </main>
    </div>
  );
}
