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

type PersonRole = keyof typeof ROLE_LABELS;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isPersonRole(value: string): value is PersonRole {
  return Object.prototype.hasOwnProperty.call(
    ROLE_LABELS,
    value
  );
}

export default async function PeoplePage({
  searchParams,
}: PageProps<"/admin/people">) {
  // Keep existing access permissions.
  await requireRole("admin", "im");

  const sp = await searchParams;
  const store = getStore();

  const [people, allHubs] = await Promise.all([
    store.list("people"),
    store.list("hubs"),
  ]);

  const sortedPeople = [...people].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const sortedHubs = [...allHubs].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Only active hubs are offered for adding/editing people,
  // preserving the behaviour of your original page.
  const activeHubs = sortedHubs.filter(
    (hub) => hub.active !== "false"
  );

  // Include all hubs when resolving existing people's cities.
  const hubById = new Map(
    allHubs.map((hub) => [hub.hub_id, hub])
  );

  // Read filters from the URL.
  const requestedRole = normalize(one(sp.role));

  const selectedRole = isPersonRole(requestedRole)
    ? requestedRole
    : "";

  const selectedCity = normalize(one(sp.city));

  /*
   * City is taken from the person's assigned hub.
   * If hub.city is blank, use the hub name.
   */
  function cityForHub(hubId: string): string {
    const hub = hubById.get(hubId);

    if (!hub) return "";

    return (hub.city ?? "").trim() || hub.name.trim();
  }

  // Build a case-insensitive, de-duplicated list of cities.
  const cityMap = new Map<string, string>();

  for (const hub of sortedHubs) {
    const label =
      (hub.city ?? "").trim() || hub.name.trim();

    const value = normalize(label);

    if (value && !cityMap.has(value)) {
      cityMap.set(value, label);
    }
  }

  const cityOptions = [...cityMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Both selected filters must match.
  const filteredPeople = sortedPeople.filter((person) => {
    const roleMatches =
      !selectedRole || person.role === selectedRole;

    const cityMatches =
      !selectedCity ||
      normalize(cityForHub(person.hub)) === selectedCity;

    return roleMatches && cityMatches;
  });

  const hasFilters = Boolean(selectedRole || selectedCity);

  const unknownCity =
    Boolean(selectedCity) && !cityMap.has(selectedCity);

  // Find the actual Bangalore hub ID instead of assuming it.
  const bangaloreHub =
    activeHubs.find(
      (hub) => normalize(hub.hub_id) === "bangalore"
    ) ??
    activeHubs.find(
      (hub) => normalize(hub.name) === "bangalore"
    );

  const defaultHubId =
    bangaloreHub?.hub_id ??
    activeHubs[0]?.hub_id ??
    "";

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>

      <h1>People — filters enabled</h1>

      <p className={styles.muted}>
        {people.length} people. Email is required when adding
        a person. Use their Google login email to link their
        account. Deactivate instead of deleting so history
        stays intact.
      </p>

      {one(sp.error) && (
        <p className={styles.error}>
          Please check the name, role and hub, and enter a
          valid email address. Email cannot be blank.
        </p>
      )}

      {/* FILTERS: always visible directly below the heading. */}
      <section
        aria-label="Filter people"
        style={{
          display: "block",
          marginTop: 20,
          marginBottom: 24,
          padding: 18,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          backgroundColor: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 18,
          }}
        >
          Filter people
        </h2>

        <form
          action="/admin/people"
          method="get"
          key={`${selectedRole}:${selectedCity}`}
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 14,
          }}
        >
          {/* Role filter does not change a person's saved role. */}
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flex: "1 1 180px",
              minWidth: 0,
            }}
          >
            <span style={{ fontWeight: 600 }}>Role</span>

            <select
              name="role"
              defaultValue={selectedRole}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #94a3b8",
                borderRadius: 6,
                backgroundColor: "#ffffff",
                color: "#0f172a",
              }}
            >
              <option value="">All roles</option>
              <option value="im">IM</option>
              <option value="ifo">IFO</option>
              <option value="fo">FO</option>
              <option value="rig">Rig</option>
            </select>
          </label>

          {/* City options come from the hubs collection. */}
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flex: "1 1 180px",
              minWidth: 0,
            }}
          >
            <span style={{ fontWeight: 600 }}>City</span>

            <select
              name="city"
              defaultValue={selectedCity}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #94a3b8",
                borderRadius: 6,
                backgroundColor: "#ffffff",
                color: "#0f172a",
              }}
            >
              <option value="">All cities</option>

              {/* Preserve an unavailable city supplied in the URL. */}
              {unknownCity && (
                <option value={selectedCity}>
                  {one(sp.city)} — unavailable
                </option>
              )}

              {cityOptions.map((city) => (
                <option
                  key={city.value}
                  value={city.value}
                >
                  {city.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            style={{
              padding: "10px 16px",
              border: 0,
              borderRadius: 6,
              backgroundColor: "#0f172a",
              color: "#ffffff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Apply filters
          </button>

          {hasFilters && (
            <Link
              href="/admin/people"
              style={{
                padding: "10px 0",
                color: "#1d4ed8",
                textDecoration: "underline",
              }}
            >
              Clear filters
            </Link>
          )}
        </form>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: 14,
          }}
        >
          Showing <strong>{filteredPeople.length}</strong>{" "}
          of <strong>{people.length}</strong> people.
          City is based on each person&apos;s assigned hub;
          the hub name is used when its city is blank.
        </p>
      </section>

      {/* Existing bulk import, separate from the filter form. */}
      <details className={styles.details}>
        <summary>Bulk import from a spreadsheet</summary>

        <p className={styles.muted}>
          Paste cells copied from Excel or Google Sheets, or
          upload a CSV. Columns: Name, Role (IM, IFO, FO, Rig),
          Hub, Email, with the header in the first row.
          People who already exist (same name and hub) are
          skipped.
        </p>

        <ImportForm />
      </details>

      {/* Add person: filters do not alter these input values. */}
      <h2>Add person</h2>

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
          {Object.entries(ROLE_LABELS).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            )
          )}
        </select>

        <select
          name="hub"
          defaultValue={defaultHubId}
          aria-label="New person's hub"
          required
        >
          {activeHubs.length === 0 && (
            <option value="">
              No active hubs available
            </option>
          )}

          {activeHubs.map((hub) => (
            <option
              key={hub.hub_id}
              value={hub.hub_id}
            >
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

        <button
          type="submit"
          disabled={activeHubs.length === 0}
        >
          Add person
        </button>
      </form>

      {/* Render only the people matching the selected filters. */}
      <h2 style={{ marginTop: 24 }}>People list</h2>

      <div className={styles.list}>
        {filteredPeople.length === 0 ? (
          <p className={styles.muted}>
            {hasFilters
              ? "No people match the selected role and city. Change the filters or click Clear filters."
              : "No people have been added yet."}
          </p>
        ) : (
          filteredPeople.map((person) => (
            <PersonRow
              key={person.person_id}
              person={person}
              hubs={activeHubs}
            />
          ))
        )}
      </div>
    </main>
  );
}