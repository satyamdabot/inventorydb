/** The free-text `attributes` field: either a JSON object (key/value extras) or a plain string. */
export function parseAttributes(raw: string): [string, string][] | string {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return Object.entries(obj).map(([k, v]) => [k, String(v)]);
  } catch {}
  return raw;
}

/** One line for a table cell: JSON entries joined as "key: value", or the plain string as-is. */
export function formatAttributes(raw: string): string {
  const parsed = parseAttributes(raw);
  return typeof parsed === "string" ? parsed : parsed.map(([k, v]) => `${k}: ${v}`).join(", ");
}
