import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import styles from "../admin.module.css";
import { addPerson } from "./actions";
import ImportForm from "./ImportForm";
import PersonRow from "./PersonRow";

const ROLE_LABELS = {
  im: "IM",
  ifo: "IFO",
  fo: "FO",
  rig: "Rig team",
} as const;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export default async function PeoplePage({
  searchParams,
}: PageProps<"/admin/people">) {
  await requireRole("admin", "im");

  const sp = await searchParams;
  const store = getStore();

  const [people, allHubs] = await Promise.all([
    store.list("people"),
    store.list("hubs"),
  ]);

  // Active hubs are available when adding/editing people.
  const hubs = allHubs
    .filter((hub) => hub.active !== "false")
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedPeople = [...people].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Use all hubs for filtering so people linked to inactive
  // hubs can still be found.
  const hubById = new Map(
    allHubs.map((hub) => [hub.hub_id, hub])
  );

  // Read the filters from the page URL.
  const requestedRole = normalize(one(sp.role));

  const roleFilter = Object.prototype.hasOwnProperty.call(
    ROLE_LABELS,
    requestedRole
  )
    ? requestedRole
    : "";

  const cityFilter = normalize(one(sp.city));

  /*
   * Build a unique city dropdown.
   * Prefer the hub's city; fall back to its name when city is blank.
   */
  const cityLabels = new Map<string, string>();

  for (const hub of allHubs) {
    const label = (hub.city ?? "").trim() || hub.name.trim();
    const key = normalize(label);

    if (key && !cityLabels.has(key)) {
      cityLabels.set(key, label);
    }
  }

  const cityOptions = [...cityLabels.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const selectedCityKnown =
    !cityFilter || cityLabels.has(cityFilter);

  // Apply both filters together.
  const filteredPeople = sortedPeople.filter((person) => {
    const assignedHub = hubById.get(person.hub);

    const personCity = assignedHub
      ? normalize(
          (assignedHub.city ?? "").trim() ||
            assignedHub.name
        )
      : "";

    const matchesRole =
      !roleFilter || person.role === roleFilter;

    const matchesCity =
      !cityFilter || personCity === cityFilter;

    return matchesRole && matchesCity;
  });

  const hasFilters = Boolean(roleFilter || cityFilter);

  // Default the Add person hub dropdown to Bangalore when available.
  const bangaloreHub =
    hubs.find(
      (hub) => normalize(hub.hub_id) === "bangalore"
    ) ??
    hubs.find(
      (hub) => normalize(hub.name) === "bangalore"
    );

  const defaultHubId =
    bangaloreHub?.hub_id ?? hubs[0]?.hub_id ?? "";

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>

      <h1>People</h1>

      <p className={styles.muted}>
        {people.length} people. Email is required when adding a
        person. Use their Google login email to link their account.
        Deactivate instead of deleting so history stays intact.
      </p>

      {one(sp.error) && (
        <p className={styles.error}>
          Please check the name, role and hub, and enter a valid
          email address. Email cannot be blank.
        </p>
      )}

      {/* Existing bulk import remains unchanged. */}
      <details className={styles.details}>
        <summary>Bulk import from a spreadsheet</summary>

        <p className={styles.muted}>
          Paste cells copied from Excel or Google Sheets, or upload
          a CSV. Columns: Name, Role (IM, IFO, FO, Rig), Hub, Email,
          with the header in the first row. People who already
          exist (same name and hub) are skipped.
        </p>

        <ImportForm />
      </details>

      {/* Add person form is separate from the filter form. */}
      <form action={addPerson} className={styles.row}>
        <input
          name="name"
          placeholder="Full name"
          aria-label="Full name"
          autoComplete="name"
          maxLength={80}
          required
        />

        <select
          name="role"
          defaultValue="im"
          aria-label="New person's role"
          required
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          name="hub"
          defaultValue={defaultHubId}
          aria-label="New person's hub"
          required
        >
          {hubs.length === 0 && (
            <option value="">No active hubs available</option>
          )}

          {hubs.map((hub) => (
            <option key={hub.hub_id} value={hub.hub_id}>
              {hub.name}
            </option>
          ))}
        </select>

        <input
          name="email"
          type="email"
          placeholder="Email (required)"
          aria-label="Email (required)"
          autoComplete="email"
          required
        />

        <button type="submit" disabled={hubs.length === 0}>
          Add person
        </button>
      </form>

      {/* NEW: Role and City filters for the people list. */}
      <section
        aria-label="Filter people"
        style={{
          marginTop: 24,
          marginBottom: 20,
          paddingTop: 16,
          borderTop: "1px solid #cbd5e1",
        }}
      >
        <h2>Filter people</h2>

        <form
          action="/admin/people"
          method="get"
          className={styles.row}
          key={`${roleFilter}:${cityFilter}`}
        >
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span>Role</span>

            <select name="role" defaultValue={roleFilter}>
              <option value="">All roles</option>
              <option value="im">IM</option>
              <option value="ifo">IFO</option>
              <option value="fo">FO</option>
              <option value="rig">Rig</option>
            </select>
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span>City</span>

            <select name="city" defaultValue={cityFilter}>
              <option value="">All cities</option>

              {/* Preserve an unknown URL filter without silently
                  displaying a different selection. */}
              {!selectedCityKnown && (
                <option value={cityFilter}>
                  {one(sp.city)} — unavailable
                </option>
              )}

              {cityOptions.map((city) => (
                <option key={city.value} value={city.value}>
                  {city.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">Apply filters</button>

          {hasFilters && (
            <Link href="/admin/people">
              Clear filters
            </Link>
          )}
        </form>

        <p className={styles.muted}>
          Showing {filteredPeople.length} of {people.length} people.
          City is based on the assigned hub.
        </p>
      </section>

      {/* Display only matching people. */}
      <div className={styles.list}>
        {filteredPeople.length === 0 ? (
          <p className={styles.muted}>
            {hasFilters
              ? "No people match the selected role and city."
              : "No people have been added yet."}
          </p>
        ) : (
          filteredPeople.map((person) => (
            <PersonRow
              key={person.person_id}
              person={person}
              hubs={hubs}
            />
          ))
        )}
      </div>
    </main>
  );
}