import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { one } from "@/lib/labels";
import type { Hub } from "@/lib/schema";
import { getStore } from "@/lib/store";
import styles from "../admin.module.css";
import { addPerson } from "./actions";
import { PERSON_ROLES, cityKey, cityLabel, filterQuery, readFilters } from "./filters";
import ImportForm from "./ImportForm";
import PersonRow from "./PersonRow";

const ERRORS: Record<string, string> = {
  email_exists: "This email address is already there. Edit the existing person or use a different email.",
  person_not_found: "This person could not be found. Refresh the page and try again.",
  invalid: "Please check the name, role and hub, and enter a valid email address. Email cannot be blank.",
};
const DONE: Record<string, string> = {
  added: "Person added successfully.",
  saved: "Person updated successfully.",
};

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  await requireRole("admin", "im");
  const sp = await searchParams;
  const store = getStore();
  const [people, hubs] = await Promise.all([store.list("people"), store.list("hubs")]);

  // Hubs, sorted once. Each hub's city is worked out once, then looked up per person.
  const sortedHubs = [...hubs].sort(byName);
  const activeHubs = sortedHubs.filter((h) => h.active !== "false");
  const hubById = new Map(hubs.map((h) => [h.hub_id, h]));
  const cityOfHub = new Map(hubs.map((h) => [h.hub_id, cityKey(cityLabel(h))]));

  // City dropdown: every city with a hub (inactive ones too, so old people can still be found).
  const cities = new Map<string, string>();
  for (const h of sortedHubs) {
    const label = cityLabel(h);
    if (label && !cities.has(cityKey(label))) cities.set(cityKey(label), label);
  }
  const cityOptions = [...cities].sort((a, b) => a[1].localeCompare(b[1]));

  // Filters from the address bar, e.g. /admin/people?role=fo&city=kadapa
  const { role, city } = readFilters(sp);
  const filtering = !!(role || city);
  const unknownCity = !!city && !cities.has(city);
  const shown = people
    .filter((p) => (!role || p.role === role) && (!city || cityOfHub.get(p.hub) === city))
    .sort(byName);

  // A person on an inactive hub keeps that hub in their own dropdown. Built once per such hub, not per row.
  const withInactive = new Map<string, Hub[]>();
  const hubsFor = (hubId: string) => {
    const hub = hubById.get(hubId);
    if (!hub || hub.active !== "false") return activeHubs;
    let list = withInactive.get(hubId);
    if (!list) withInactive.set(hubId, (list = [...activeHubs, hub].sort(byName)));
    return list;
  };

  const defaultHub = (activeHubs.find((h) => cityKey(h.hub_id) === "bangalore" || cityKey(h.name) === "bangalore") ?? activeHubs[0])?.hub_id ?? "";
  const keep = filterQuery({ role, city }); // passed to the forms so filters survive add and edit
  const error = one(sp.error);
  const done = one(sp.done);

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>People</h1>
      <p className={styles.muted}>
        {people.length} people. Email is required when adding or editing a person. Use their Google login email to link
        their account. Deactivate instead of deleting so history stays intact.
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {ERRORS[error] ?? ERRORS.invalid}
        </p>
      )}
      {DONE[done] && (
        <p className={styles.ok} role="status">
          {DONE[done]}
        </p>
      )}

      <details className={styles.details}>
        <summary>Bulk import from a spreadsheet</summary>
        <p className={styles.muted}>
          Paste cells copied from Excel or Google Sheets, or upload a CSV. Columns: Name, Role (IM, IFO, FO, Rig), Hub,
          Email, with the header in the first row.
        </p>
        <ImportForm />
      </details>

      <section className={styles.filterBox} aria-label="Filter people">
        <h2>Filter people</h2>
        {/* `key` resets the dropdowns to the address bar after a filter is applied or cleared. */}
        <form method="get" action="/admin/people" className={styles.filterForm} key={keep}>
          <label className={styles.filterField}>
            <span>Role</span>
            <select name="role" defaultValue={role}>
              <option value="">All roles</option>
              {PERSON_ROLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>City</span>
            <select name="city" defaultValue={city}>
              <option value="">All cities</option>
              {unknownCity && <option value={city}>{one(sp.city)} (no hub)</option>}
              {cityOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Apply filters</button>
          {filtering && (
            <Link href="/admin/people" className={styles.filterClear}>
              Clear filters
            </Link>
          )}
        </form>
        <p className={styles.muted}>
          Showing <strong>{shown.length}</strong> of <strong>{people.length}</strong> people. City comes from the
          person&apos;s hub; the hub name is used if its city is blank.
        </p>
      </section>

      <h2>Add person</h2>
      <form action={addPerson} className={styles.row}>
        <input type="hidden" name="keep" value={keep} />
        <input name="name" placeholder="Full name" aria-label="Full name" autoComplete="name" maxLength={80} required />
        <select name="role" defaultValue="im" aria-label="New person's role" required>
          {PERSON_ROLES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="hub" defaultValue={defaultHub} aria-label="New person's hub" required>
          {activeHubs.length === 0 && <option value="">No active hubs available</option>}
          {activeHubs.map((h) => (
            <option key={h.hub_id} value={h.hub_id}>
              {h.name}
            </option>
          ))}
        </select>
        <input name="email" type="email" placeholder="Email (required)" aria-label="Email (required)" autoComplete="email" required />
        <button type="submit" disabled={activeHubs.length === 0}>
          Add person
        </button>
      </form>

      <h2>People list</h2>
      <div className={styles.list}>
        {shown.length === 0 ? (
          <p className={styles.muted}>{filtering ? "No people match the selected role and city." : "No people have been added yet."}</p>
        ) : (
          shown.map((p) => (
            <PersonRow
              // A new key after a save resets the row's fields to what was stored.
              key={`${p.person_id}:${p.name}:${p.role}:${p.hub}:${p.linked_user}:${p.active}`}
              person={p}
              hubs={hubsFor(p.hub)}
              keep={keep}
            />
          ))
        )}
      </div>
    </main>
  );
}