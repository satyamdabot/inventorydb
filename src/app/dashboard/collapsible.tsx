import type { ReactNode } from "react";
import styles from "./dashboard.module.css";

/**
 * A block that shows only its count until it is clicked, then reveals the list. It is a native
 * <details>, so it works without scripting, opens from the keyboard, and stays closed on load.
 */
export function Collapsible({
  title,
  count,
  meta,
  children,
}: {
  title: string;
  count: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <details className={styles.collapse}>
      <summary className={styles.collapseHead}>
        <span className={styles.collapseTitle}>{title}</span>
        <span className={styles.collapseCount}>{count}</span>
        {meta && <span className={styles.collapseMeta}>{meta}</span>}
        <span className={styles.collapseHint}>
          <span className={styles.whenClosed}>Show list</span>
          <span className={styles.whenOpen}>Hide list</span>
        </span>
      </summary>
      <div className={styles.collapseBody}>{children}</div>
    </details>
  );
}
