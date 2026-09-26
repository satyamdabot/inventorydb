import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { computeDashboard } from "@/lib/dashboard";
import { ROLE_LABELS, one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import { buildHubTree } from "@/lib/hub-tree";
import { n } from "./charts";
import { HubTreeView, countHidden } from "./hub-tree-view";
import styles from "./dashboard.module.css";

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

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
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
  const d = computeDashboard(items, events, people, hubs, { hub, days: 30, now: new Date() });
  const scope: Record<string, string> = hub ? { hub } : {};
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const tree = buildHubTree(hubs, items);
  const showEmpty = one(sp.empty) === "1";
  const hiddenEmpty = countHidden(tree, false);

  const s = d.byStatus;
  const tiles = [
    { label: "Total cards", value: d.total, hint: hub ? `at ${hubName.get(hub)}` : "across all hubs", href: inventory(scope) },
    { label: "In stock", value: s.in_stock, hint: "at a hub, ready to send", href: inventory({ status: "in_stock", ...scope }) },
    { label: "With field officers", value: s.with_fo, hint: "out recording", href: inventory({ status: "with_fo", ...scope }) },
    { label: "With rig team", value: s.with_rig, hint: "data being collected", href: inventory({ status: "with_rig", ...scope }) },
    {
      label: "In transit",
      value: s.traveling + s.pending,
      hint: "traveling or waiting to be received",
      href: inventory({ status: "traveling,pending", ...scope }),
    },
    {
      label: "Lost or damaged",
      value: s.lost + s.damaged,
      hint: "need follow-up",
      href: inventory({ status: "lost,damaged", ...scope }),
      icon: "critical" as const,
    },
  ];

  // Plain sentences about what to look at, most useful first. Empty means all is well.
  const attention: Attention[] = [];
  for (const p of d.pending) {
    attention.push({
      key: `pending-${p.hub_id}`,
      text: `${plural(p.count, "card")} waiting to be received at ${p.name}${p.oldestDays ? `, oldest ${p.oldestDays} days` : ""}`,
      href: `/handover/receive?${new URLSearchParams({ hub: p.hub_id })}`,
      tone: "warning",
    });
  }
  for (const r of d.longestOut.filter((x) => (x.days ?? 0) > 0).slice(0, 3)) {
    attention.push({
      key: `out-${r.item_id}`,
      text: `${r.item_id} has been out ${r.days} days (${r.holder || "unknown holder"})`,
      href: `/inventory/${r.item_id}`,
      tone: "info",
    });
  }
  if (s.lost + s.damaged > 0) {
    attention.push({
      key: "problem",
      text: `${plural(s.lost, "card")} lost, ${plural(s.damaged, "card")} damaged`,
      href: inventory({ status: "lost,damaged", ...scope }),
      tone: "critical",
    });
  }
  if (d.inconsistencies.length > 0) {
    attention.push({
      key: "mismatch",
      text: `${plural(d.inconsistencies.length, "card")} don't match their history`,
      href: "/dashboard/analytics",
      tone: "critical",
    });
  }

  return (
    <div className={styles.root}>
      <main className={styles.wrap}>
        <p className={styles.back}>
          <Link href="/">← Home</Link>
        </p>
        <h1>Dashboard</h1>
        <p className={styles.muted}>
          The latest known position of every card. It updates each time cards are sent, received or corrected.
        </p>

        <section className={styles.tiles} aria-label="Overview">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className={styles.tile}>
              <span className={styles.tileLabel}>
                {t.icon && (
                  <span className={`${styles.icon} ${styles.iconCritical}`} aria-hidden>
                    ✕
                  </span>
                )}
                {t.label}
              </span>
              <span className={styles.tileValue}>{n(t.value)}</span>
              <span className={styles.tileHint}>{t.hint}</span>
            </Link>
          ))}
        </section>

        <section className={styles.card} aria-label="Where the cards are">
          <div className={styles.sectionHead}>
            <h2>Where the cards are</h2>
            {hub && (
              <Link href="/dashboard" className={styles.link}>
                Show all hubs
              </Link>
            )}
          </div>
          <p className={styles.muted}>
            Each hub shows the cards it holds, including the hubs under it. Click a hub name for everything about
            it, or the arrow to open or close its sub-hubs.
          </p>
          <HubTreeView roots={tree} showEmpty={showEmpty} />
          {hiddenEmpty > 0 && !showEmpty && (
            <p className={styles.muted}>
              {hiddenEmpty} hub{hiddenEmpty === 1 ? "" : "s"} with no cards {hiddenEmpty === 1 ? "is" : "are"} hidden.{" "}
              <Link href={`/dashboard?${new URLSearchParams({ ...scope, empty: "1" })}`} className={styles.link}>
                Show them
              </Link>
            </p>
          )}
          {showEmpty && (
            <p className={styles.muted}>
              <Link href={hub ? `/dashboard?${new URLSearchParams(scope)}` : "/dashboard"} className={styles.link}>
                Hide hubs with no cards
              </Link>
            </p>
          )}
        </section>

        <div className={styles.grid2}>
          <section className={styles.card} aria-label="Needs attention">
            <h2>Needs attention</h2>
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

          <section className={styles.card} aria-label="Who has cards">
            <h2>Who has cards</h2>
            {d.holders.length === 0 ? (
              <p className={styles.muted}>Nothing is out right now.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th className={styles.num}>Cards</th>
                      <th className={styles.num}>Longest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.holders.slice(0, 8).map((h) => (
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
        </div>

        <p className={styles.muted}>
          <Link href="/dashboard/analytics" className={styles.link}>
            More analytics
          </Link>{" "}
          — cards moved per day, hub owned vs held, longest out, data health.
        </p>
      </main>
    </div>
  );
}
