import Link from "next/link";
import { LATE_AFTER_HOURS, type Dashboard } from "@/lib/dashboard";
import { n } from "./charts";
import styles from "./dashboard.module.css";
import { Icon, type IconName } from "./icons";

const howLong = (hours: number) => (hours < 48 ? `${Math.floor(hours)} hours` : `${Math.floor(hours / 24)} days`);
const dayText =(d: number | null) => (d === null ? "" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`);

/**
 * The four numbers a manager reads first: fleet, utilization, cards waiting to be received, and how long
 * cards have been out. Each says how it is worked out, so nobody has to ask. `hubParam` scopes the links
 * to one hub (or a hub and its sub-hubs, comma separated) on a hub's details page.
 */
export function SummaryKpis({ d, hubParam }: { d: Dashboard; hubParam?: string }) {
  const list = (params: Record<string, string> = {}) =>
    `/inventory?${new URLSearchParams({ ...(hubParam ? { hub: hubParam } : {}), ...params })}`;
  const unusable = d.total - d.usable;
  const pct = d.utilization === null ? null : Math.round(d.utilization);

  const cards: {
    key: string;
    icon: IconName;
    label: string;
    value: string;
    note: string;
    href: string;
    meter?: number;
    warn?: boolean;
  }[] = [
    {
      key: "fleet",
      icon: "layers",
      label: "Fleet",
      value: n(d.total),
      note: unusable > 0 ? `${n(d.usable)} usable · ${n(unusable)} lost, damaged or retired` : `${n(d.usable)} usable`,
      href: list(),
    },
    {
      key: "utilization",
      icon: "activity",
      label: "Utilization",
      value: pct === null ? "—" : `${pct}%`,
      note: `${n(d.outCount)} out of ${n(d.usable)} usable cards`,
      href: list({ status: "pending,traveling,with_fo,with_rig,with_internal" }),
      meter: pct ?? 0,
    },
    {
      key: "waiting",
      icon: "inbox",
      label: "Waiting to be received",
      value: n(d.waiting),
      note: d.waiting > 0 ? `Sent or traveling · oldest ${dayText(d.oldestWaitingDays)}` : "Nothing waiting",
      href: hubParam ? list({ status: "pending,traveling" }) : "/handover/receive",
    },
    {
      key: "late",
      icon: "alert",
      label: "Late cards",
      value: n(d.lateCards),
      note:
        d.lateCards > 0
          ? `Over ${LATE_AFTER_HOURS} hours · oldest ${howLong(d.oldestLateHours ?? 0)}`
          : `Nothing over ${LATE_AFTER_HOURS} hours`,
      // On the main page this jumps to the Needs attention list, which says who to chase.
      href: hubParam ? list({ status: "with_fo,traveling,pending" }) : "/dashboard#attention",
      warn: d.lateCards > 0,
    },
  ];

  return (
    <section className={styles.summaryGrid} aria-label="Management summary">
      {cards.map((c) => (
        <Link key={c.key} href={c.href} className={styles.summary}>
          <span className={styles.summaryTop}>
            <span className={styles.summaryLabel}>{c.label}</span>
            <span className={`${styles.summaryIcon} ${c.warn ? styles.summaryIconWarn : ""}`}>
              <Icon name={c.icon} size={18} />
            </span>
          </span>
          <span className={styles.summaryValue}>{c.value}</span>
          {c.meter !== undefined && (
            <span className={styles.meter} role="img" aria-label={`${c.meter}% utilization`}>
              <i style={{ width: `${Math.min(100, c.meter)}%` }} />
            </span>
          )}
          <span className={styles.summaryNote}>{c.note}</span>
        </Link>
      ))}
    </section>
  );
}
