import { STATUSES } from "../src/lib/schema";
import { getStore } from "../src/lib/store";

// Read-only check of the items tab: duplicates, unknown hubs/statuses/holders, bad attributes.
process.env.STORE = "sheets";
const store = getStore();
const [items, hubs, people] = await Promise.all([
  store.list("items"),
  store.list("hubs"),
  store.list("people"),
]);
const hubIds = new Set(hubs.map((h) => h.hub_id));
const personIds = new Set(people.map((p) => p.person_id));
const statuses = new Set<string>(STATUSES);

console.log(`items: ${items.length}`);
const count = (key: (i: (typeof items)[number]) => string) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log("by status:", count((i) => i.status));
console.log("by current_hub:", count((i) => i.current_hub).slice(0, 10));
console.log("by item_type:", count((i) => i.item_type));

const problems: string[] = [];
const seen = new Map<string, number>();
items.forEach((i, idx) => {
  const row = idx + 2;
  seen.set(i.item_id, (seen.get(i.item_id) ?? 0) + 1);
  if (i.item_id !== i.item_id.trim()) problems.push(`row ${row}: item_id has spaces around it`);
  if (!hubIds.has(i.home_hub)) problems.push(`row ${row}: home_hub "${i.home_hub}" not in hubs`);
  if (!hubIds.has(i.current_hub)) problems.push(`row ${row}: current_hub "${i.current_hub}" not in hubs`);
  if (!statuses.has(i.status)) problems.push(`row ${row}: status "${i.status}" invalid`);
  if (i.current_holder && !personIds.has(i.current_holder))
    problems.push(`row ${row}: current_holder "${i.current_holder}" not in people`);
  for (const col of ["prism_no", "brand", "model"] as const) {
    if (!i[col]) problems.push(`row ${row}: ${col} is empty`);
    else if (i[col] !== i[col].trim()) problems.push(`row ${row}: ${col} has spaces around it`);
    else if (i[col].startsWith("#") || i[col].startsWith("=")) problems.push(`row ${row}: ${col} looks like a formula/error ("${i[col]}")`);
  }
});
const prisms = new Map<string, number>();
for (const i of items) if (i.prism_no) prisms.set(i.prism_no, (prisms.get(i.prism_no) ?? 0) + 1);
for (const [p, n] of prisms) if (n > 1) problems.push(`duplicate prism_no ${p} (${n} rows)`);
console.log("by brand:", count((i) => i.brand));
console.log("by model:", count((i) => i.model));
for (const [id, n] of seen) if (n > 1) problems.push(`duplicate item_id ${id} (${n} rows)`);

console.log(`problems: ${problems.length}`);
console.log(problems.slice(0, 25).join("\n"));
console.log("sample:", JSON.stringify(items.slice(0, 2), null, 1));
