/** Merges ticked ids with scanned/pasted text (one serial per line), trimmed and de-duplicated. */
export function collectIds(scanned: string, ticked: string[] = []): string[] {
  const all = [...ticked, ...scanned.split(/[\s,]+/)].map((s) => s.trim()).filter(Boolean);
  return [...new Set(all)];
}
