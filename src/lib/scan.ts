/** Merges ticked ids with scanned/pasted text (one serial per line), trimmed and de-duplicated. */
export function collectIds(scanned: string, ticked: string[] = []): string[] {
  const all = [...ticked, ...scanned.split(/[\s,]+/)].map((s) => s.trim()).filter(Boolean);
  return [...new Set(all)];
}

export type ScanState = "ok" | "unknown" | "wrong" | "duplicate";

export interface ScanRow {
  code: string; // exactly what the scanner typed
  id?: string; // the card's real serial, when the code matches one (letter case is ignored)
  state: ScanState;
  status?: string; // the card's current status, when it exists
}

/**
 * Explains each scanned line before anything is saved: ok, not a known card, a card in the wrong
 * state for this action, or a repeat. `allowed` is the set of statuses this action accepts.
 * Letter case is ignored, because a scanner with Caps Lock on types every capital as lowercase.
 */
export function classifyScans(text: string, statuses: Map<string, string>, allowed: ReadonlySet<string>): ScanRow[] {
  const byUpper = new Map<string, string>();
  for (const id of statuses.keys()) if (!byUpper.has(id.toUpperCase())) byUpper.set(id.toUpperCase(), id);

  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((code): ScanRow => {
      const id = statuses.has(code) ? code : byUpper.get(code.toUpperCase());
      const status = id === undefined ? undefined : statuses.get(id);
      const key = id ?? code;
      if (seen.has(key)) return { code, id, state: "duplicate", status };
      seen.add(key);
      if (id === undefined) return { code, state: "unknown" };
      return { code, id, state: allowed.has(status!) ? "ok" : "wrong", status };
    });
}
