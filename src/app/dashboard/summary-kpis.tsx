import Link from "next/link";
import { LATE_AFTER_HOURS, type Dashboard } from "@/lib/dashboard";
import type { Item } from "@/lib/schema";
import { n } from "./charts";
import styles from "./dashboard.module.css";
import { Icon, type IconName } from "./icons";

const howLong = (hours: number) =>
  hours < 48
    ? `${Math.floor(hours)} hours`
    : `${Math.floor(hours / 24)} days`;

const dayText = (d: number | null) =>
  d === null
    ? ""
    : d === 0
      ? "today"
      : `${d} day${d === 1 ? "" : "s"} ago`;

interface FleetCounts {
  storage512: number;
  storage256: number;
  storageUnknown: number;
  black: number;
  green: number;
  colourUnknown: number;
}

interface SummaryKpisProps {
  d: Dashboard;
  hubParam?: string;

  // Pass inventory items covering the same scope as d.total.
  // Optional to keep existing callers compatible.
  items?: readonly Item[];
}

/**
 * Count storage and colour from the existing attributes JSON.
 *
 * Expected saved attributes:
 * {
 *   "capacity": "512 GB",
 *   "card_type": "Black"
 * }
 */
function countFleet(items: readonly Item[]): FleetCounts {
  const counts: FleetCounts = {
    storage512: 0,
    storage256: 0,
    storageUnknown: 0,
    black: 0,
    green: 0,
    colourUnknown: 0,
  };

  for (const item of items) {
    let attributes: Record<string, unknown> = {};

    // Invalid JSON must not break the dashboard.
    try {
      const parsed: unknown = JSON.parse(item.attributes || "{}");

      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        attributes = parsed as Record<string, unknown>;
      }
    } catch {
      // Missing or invalid details are counted as unknown.
    }

    // Accept "512 GB", "512gb", "512", and the equivalent 256 values.
    const capacity = String(attributes.capacity ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();

    if (capacity === "512GB" || capacity === "512") {
      counts.storage512++;
    } else if (capacity === "256GB" || capacity === "256") {
      counts.storage256++;
    } else {
      counts.storageUnknown++;
    }

    // Colour is counted separately from storage.
    const colour = String(attributes.card_type ?? "")
      .trim()
      .toLowerCase();

    if (colour === "black") {
      counts.black++;
    } else if (colour === "green") {
      counts.green++;
    } else {
      counts.colourUnknown++;
    }
  }

  return counts;
}

/**
 * Management summary:
 * Fleet, utilization, waiting items, and late items.
 */
export function SummaryKpis({
  d,
  hubParam,
  items,
}: SummaryKpisProps) {
  const list = (params: Record<string, string> = {}) =>
    `/inventory?${new URLSearchParams({
      ...(hubParam ? { hub: hubParam } : {}),
      ...params,
    })}`;

  const unusable = d.total - d.usable;
  const pct =
    d.utilization === null ? null : Math.round(d.utilization);

  // Do not display invented zeros when items were not supplied.
  const fleet = items !== undefined ? countFleet(items) : null;

  const fleetDetails = fleet
    ? [
        { label: "512 GB", count: fleet.storage512 },
        { label: "256 GB", count: fleet.storage256 },
        { label: "Black cards", count: fleet.black },
        { label: "Green cards", count: fleet.green },
      ]
    : [];

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
      note:
        unusable > 0
          ? `${n(d.usable)} usable · ${n(
              unusable
            )} lost, damaged or retired`
          : `${n(d.usable)} usable`,
      href: list(),
    },
    {
      key: "utilization",
      icon: "activity",
      label: "Utilization",
      value: pct === null ? "—" : `${pct}%`,
      note: `${n(d.outCount)} out of ${n(d.usable)} usable items`,
      href: list({
        status: "pending,traveling,with_fo,with_rig,with_internal",
      }),
      meter: pct ?? 0,
    },
    {
      key: "waiting",
      icon: "inbox",
      label: "Waiting to be received",
      value: n(d.waiting),
      note:
        d.waiting > 0
          ? `Sent or traveling · oldest ${dayText(
              d.oldestWaitingDays
            )}`
          : "Nothing waiting",
      href: hubParam
        ? list({ status: "pending,traveling" })
        : "/handover/receive",
    },
    {
      key: "late",
      icon: "alert",
      label: "Late items",
      value: n(d.lateCards),
      note:
        d.lateCards > 0
          ? `Over ${LATE_AFTER_HOURS} hours · oldest ${howLong(
              d.oldestLateHours ?? 0
            )}`
          : `Nothing over ${LATE_AFTER_HOURS} hours`,

      // Main dashboard links to Needs attention.
      // Hub dashboards link to the matching inventory statuses.
      href: hubParam
        ? list({ status: "with_fo,traveling,pending" })
        : "/dashboard#attention",
      warn: d.lateCards > 0,
    },
  ];

  return (
    <section
      className={styles.summaryGrid}
      aria-label="Management summary"
    >
      {cards.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className={styles.summary}
          style={
            c.key === "fleet"
              ? { height: "auto", minWidth: 0 }
              : undefined
          }
        >
          {/* Card heading and icon. */}
          <span className={styles.summaryTop}>
            <span className={styles.summaryLabel}>
              {c.label}
            </span>

            <span
              className={`${styles.summaryIcon} ${
                c.warn ? styles.summaryIconWarn : ""
              }`}
            >
              <Icon name={c.icon} size={18} />
            </span>
          </span>

          {/* Main metric. */}
          <span className={styles.summaryValue}>
            {c.value}
          </span>

          {/* Utilization progress bar. */}
          {c.meter !== undefined && (
            <span
              className={styles.meter}
              role="img"
              aria-label={`${c.meter}% utilization`}
            >
              <i
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, c.meter)
                  )}%`,
                }}
              />
            </span>
          )}

          <span className={styles.summaryNote}>
            {c.note}
          </span>

          {/* NEW: storage and colour breakdown inside Fleet. */}
          {c.key === "fleet" && fleet && (
            <span
              style={{
                display: "block",
                width: "100%",
                marginTop: 12,
              }}
            >
              <span
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {fleetDetails.map((detail) => (
                  <span
                    key={detail.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      minWidth: 0,
                      padding: "8px 10px",
                      border: "1px solid currentColor",
                      borderRadius: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        whiteSpace: "normal",
                      }}
                    >
                      {detail.label}
                    </span>

                    <strong style={{ fontSize: 20 }}>
                      {n(detail.count)}
                    </strong>
                  </span>
                ))}
              </span>

              {/* Keep missing or unsupported attributes visible. */}
              {fleet.storageUnknown > 0 && (
                <span
                  className={styles.summaryNote}
                  style={{
                    display: "block",
                    marginTop: 8,
                    whiteSpace: "normal",
                  }}
                >
                  Unknown / other storage:{" "}
                  {n(fleet.storageUnknown)}
                </span>
              )}

              {fleet.colourUnknown > 0 && (
                <span
                  className={styles.summaryNote}
                  style={{
                    display: "block",
                    marginTop: 8,
                    whiteSpace: "normal",
                  }}
                >
                  Unknown / other colour:{" "}
                  {n(fleet.colourUnknown)}
                </span>
              )}

              <span
                className={styles.summaryNote}
                style={{
                  display: "block",
                  marginTop: 8,
                  whiteSpace: "normal",
                }}
              >
                Storage and colour are separate breakdowns of
                the same fleet.
              </span>
            </span>
          )}

          {/* Explain when the parent page has not passed item data. */}
          {c.key === "fleet" && !fleet && (
            <span
              className={styles.summaryNote}
              style={{
                display: "block",
                marginTop: 8,
                whiteSpace: "normal",
              }}
            >
              Storage and colour data not supplied.
            </span>
          )}
        </Link>
      ))}
    </section>
  );
}