"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_LABELS } from "@/lib/labels";
import { classifyScans, type ScanState } from "@/lib/scan";
import { OUT_STATUSES, type Status } from "@/lib/schema";
import styles from "./scanbox.module.css";

// What each action accepts: sending needs stock, receiving needs a card that is out.
const ALLOWED = {
  send: new Set<string>(["in_stock"]),
  receive: new Set<string>(OUT_STATUSES),
};
const WRONG_HINT = { send: "not in stock, can't be sent", receive: "not waiting to be received" };

const MARK: Record<ScanState, string> = { ok: "✓", wrong: "✕", unknown: "✕", duplicate: "•" };

/**
 * The scan box. It keeps the cursor here, treats a Tab after a scan like Enter (some scanners send
 * Tab), and shows every scanned line as it arrives so a problem with the scanner or a code is visible
 * before anything is saved.
 */
export default function ScanBox({
  id,
  items,
  mode,
  rows = 8,
  hub,
  hubNames = {},
}: {
  id: string;
  items: { id: string; status: Status; hub: string }[];
  mode: "send" | "receive";
  rows?: number;
  hub?: string; // receive only: the hub chosen in "Receiving at"
  hubNames?: Record<string, string>;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const statuses = useMemo(() => new Map<string, string>(items.map((i) => [i.id, i.status])), [items]);
  const results = useMemo(() => {
    const placeOf = new Map(items.map((i) => [i.id, i.hub]));
    return classifyScans(text, statuses, ALLOWED[mode]).map((r) => {
      // Say so before submitting when a card is at a different hub than the one chosen: a card sent to a
      // hub must be received there, and cards must be in stock at the hub they are sent from.
      const sentTo = r.id ? placeOf.get(r.id) : undefined;
      const elsewhere = mode === "send" || r.status === "pending";
      if (hub && r.state === "ok" && elsewhere && sentTo && sentTo !== hub) {
        return { ...r, state: "wrong" as ScanState, sentTo };
      }
      return { ...r, sentTo: undefined };
    });
  }, [text, statuses, items, mode, hub]);
  const ok = results.filter((r) => r.state === "ok").length;
  const problems = results.filter((r) => r.state === "wrong" || r.state === "unknown").length;

  return (
    <div className={styles.box}>
      <div className={`${styles.state} ${focused ? styles.stateOn : ""}`} aria-live="polite">
        {focused ? "Ready to scan" : "Click the box below before scanning"}
      </div>
      <textarea
        id={id}
        ref={ref}
        name="scanned"
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          // A scanner that ends with Tab would move focus away. Keep it here and start a new line.
          if (e.key === "Tab" && !e.shiftKey && text.trim() !== "") {
            e.preventDefault();
            setText((t) => (t.endsWith("\n") ? t : `${t}\n`));
          }
        }}
        placeholder="Scan cards here. Each code should appear on its own line."
        className={styles.textarea}
        spellCheck={false}
        autoComplete="off"
      />

      {results.length > 0 && (
        <div className={styles.summary}>
          <strong>{results.length}</strong> scanned · <strong>{ok}</strong> ready
          {problems > 0 && <span className={styles.bad}> · {problems} problem(s)</span>}
          <button type="button" className={styles.clear} onClick={() => setText("")}>
            Clear
          </button>
        </div>
      )}
      {results.some((r) => r.id && r.id !== r.code) && (
        <p className={styles.caseNote}>
          Some codes arrived in a different letter case, so Caps Lock may be on. They were matched anyway.
        </p>
      )}
      {results.length > 0 && (
        <ul className={styles.list} aria-label="Scanned cards">
          {[...results].reverse().map((r, i) => (
            <li key={`${r.code}-${i}`} className={r.state === "ok" ? styles.ok : r.state === "duplicate" ? styles.dup : styles.bad}>
              <span aria-hidden>{MARK[r.state]}</span>
              <code>{r.id ?? r.code}</code>
              <span className={styles.msg}>
                {r.state === "ok" && (STATUS_LABELS[r.status as Status] ?? r.status)}
                {r.state === "wrong" &&
                  (r.sentTo
                    ? mode === "send"
                      ? `at ${hubNames[r.sentTo] ?? r.sentTo}: choose that hub in "Sending from"`
                      : `sent to ${hubNames[r.sentTo] ?? r.sentTo}: switch "Receiving at" to that hub`
                    : `${STATUS_LABELS[r.status as Status] ?? r.status}: ${WRONG_HINT[mode]}`)}
                {r.state === "unknown" && `not found in the inventory (${r.code.length} characters): ${r.code}`}
                {r.state === "duplicate" && "scanned twice, counted once"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
