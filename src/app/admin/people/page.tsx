import Link from "next/link";
import type { CSSProperties } from "react";
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

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: "1 1 180px",
  minWidth: 0,
};

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #94a3b8",
  borderRadius: 6,
  backgroundColor: "#ffffff",
  color: "#0f172a",
};

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
  await requireRole("admin", "im");

  const sp = await searchParams;
  const error = one(sp.error);
  const done = one(sp.done);

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

  const activeHubs = sortedHubs.filter(
    (hub) => hub.active !== "false"
  );

  const hubById = new Map(
    allHubs.map((hub) => [hub.hub_id, hub])
  );

  // Read role and city filters from the URL.
  const requestedRole = normalize(one(sp.role));

  const selectedRole = isPersonRole(requestedRole)
    ? requestedRole
    : "";

  const selectedCity = normalize(one(sp.city));
  const hasFilters = Boolean(selectedRole || selectedCity);

  function cityForHub(hubId: string): string {
    const hub = hubById.get(hubId);

    if (!hub) return "";

    return (hub.city ?? "").trim() || hub.name.trim();
  }

  // City dropdown includes inactive hubs for finding existing people.
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

  const unknownCity =
    Boolean(selectedCity) && !cityMap.has(selectedCity);

  const filteredPeople = sortedPeople.filter((person) => {
    const roleMatches =
      !selectedRole || person.role === selectedRole;

    const cityMatches =
      !selectedCity ||
      normalize(cityForHub(person.hub)) === selectedCity;

    return roleMatches && cityMatches;
  });

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

      <h1>People</h1>

      <p className={styles.muted}>
        {people.length} people. Email is required when adding or
        editing a person. Use their Google login email to link
        their account. Deactivate instead of deleting so history
        stays intact.
      </p>

      {/* Duplicate-email and validation messages. */}
      {error && (
        <p className={styles.error} role="alert">
          {error === "email_exists"
            ? "This email address is already there. Edit the existing person or use a different email."
            : error === "person_not_found"
              ? "This person could not be found. Refresh the page and try again."
              : "Please check the name, role and hub, and enter a valid email address. Email cannot be blank."}
        </p>
      )}

      {done === "added" && (
        <p className={styles.ok} role="status">
          Person added successfully.
        </p>
      )}

      {done === "saved" && (
        <p className={styles.ok} role="status">
          Person updated successfully.
        </p>
      )}

      {/* Import retains its existing independent validation. */}
      <details className={styles.details}>
        <summary>Bulk import from a spreadsheet</summary>

        <p className={styles.muted}>
          Paste cells copied from Excel or Google Sheets, or upload
          a CSV. Columns: Name, Role (IM, IFO, FO, Rig), Hub, Email,
          with the header in the first row.
        </p>

        <ImportForm />
      </details>

      {/* Filters appear directly after Bulk import. */}
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
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>
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
          <label style={labelStyle}>
            <span style={{ fontWeight: 600 }}>Role</span>

            <select
              name="role"
              defaultValue={selectedRole}
              style={selectStyle}
            >
              <option value="">All roles</option>
              <option value="im">IM</option>
              <option value="ifo">IFO</option>
              <option value="fo">FO</option>
              <option value="rig">Rig</option>
            </select>
          </label>

          <label style={labelStyle}>
            <span style={{ fontWeight: 600 }}>City</span>

            <select
              name="city"
              defaultValue={selectedCity}
              style={selectStyle}
            >
              <option value="">All cities</option>

              {unknownCity && (
                <option value={selectedCity}>
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

        <p style={{ margin: "14px 0 0", fontSize: 14 }}>
          Showing <strong>{filteredPeople.length}</strong> of{" "}
          <strong>{people.length}</strong> people. City comes
          from the assigned hub; the hub name is used if its city
          is blank.
        </p>
      </section>

      <h2>Add person</h2>

      {/* Separate Add form; the filters do not change these inputs. */}
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
          {activeHubs.length === 0 && (
            <option value="">No active hubs available</option>
          )}

          {activeHubs.map((hub) => (
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

        <button
          type="submit"
          disabled={activeHubs.length === 0}
        >
          Add person
        </button>
      </form>

      <h2 style={{ marginTop: 24 }}>People list</h2>

      <div className={styles.list}>
        {filteredPeople.length === 0 ? (
          <p className={styles.muted}>
            {hasFilters
              ? "No people match the selected role and city."
              : "No people have been added yet."}
          </p>
        ) : (
          filteredPeople.map((person) => {
            const assignedHub = hubById.get(person.hub);

            // Preserve an existing inactive hub during editing.
            const editingHubs =
              assignedHub &&
              !activeHubs.some(
                (hub) => hub.hub_id === assignedHub.hub_id
              )
                ? [...activeHubs, assignedHub].sort((a, b) =>
                    a.name.localeCompare(b.name)
                  )
                : activeHubs;

            return (
              <PersonRow
                key={`${person.person_id}:${person.name}:${person.role}:${person.hub}:${person.linked_user}:${person.active}`}
                person={person}
                hubs={editingHubs}
              />
            );
          })
        )}
      </div>
    </main>
  );
}