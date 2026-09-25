/** Merges ticked ids with scanned/pasted text (one serial per line), trimmed and de-duplicated. */
export function collectIds(scanned: string, ticked: string[] = []): string[] {
  const all = [...ticked, ...scanned.split(/[\s,]+/)].map((s) => s.trim()).filter(Boolean);
  return [...new Set(all)];
}

export type ScanState = "ok" | "unknown" | "wrong" | "duplicate";

export interface ScanRow {
  code: string; // exactly what the scanner typed
  state: ScanState;
  status?: string; // the card's current status, when it exists
}

/**
 * Explains each scanned line before anything is saved: ok, not a known card, a card in the wrong
 * state for this action, or a repeat. `allowed` is the set of statuses this action accepts.
 */
export function classifyScans(text: string, statuses: Map<string, string>, allowed: ReadonlySet<string>): ScanRow[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((code): ScanRow => {
      const status = statuses.get(code);
      if (seen.has(code)) return { code, state: "duplicate", status };
      seen.add(code);
      if (status === undefined) return { code, state: "unknown" };
      return { code, state: allowed.has(status) ? "ok" : "wrong", status };
    });
}
