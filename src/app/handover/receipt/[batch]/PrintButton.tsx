"use client";

import styles from "../../form.module.css";

/** Prints just this page. A plain client component, since window.print() needs the browser. */
export default function PrintButton() {
  return (
    <button type="button" className={styles.printButton} onClick={() => window.print()}>
      Print receipt
    </button>
  );
}
