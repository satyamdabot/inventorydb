import Link from "next/link";
import { requireRole } from "@/lib/authz";
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

export default async function PeoplePage({
  searchParams,
}: PageProps<"/admin/people">) {
  await requireRole("admin", "im");

  const { error } = await searchParams;
  const store = getStore();

  const [people, allHubs] = await Promise.all([
    store.list("people"),
    store.list("hubs"),
  ]);

  const hubs = allHubs
    .filter((h) => h.active !== "false")
    .sort((a, b) => a.name.localeCompare(b.name));

  people.sort((a, b) => a.name.localeCompare(b.name));

  const roleSelect = (value?: string) => (
    <select
      name="role"
      defaultValue={value ?? "im"}
      aria-label="Role"
      required
    >
      {Object.entries(ROLE_LABELS).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );

  const hubSelect = (value?: string) => (
    <select
      name="hub"
      defaultValue={value ?? "bangalore"}
      aria-label="Hub"
      required
    >
      {hubs.map((h) => (
        <option key={h.hub_id} value={h.hub_id}>
          {h.name}
        </option>
      ))}
    </select>
  );

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

      {error && (
        <p className={styles.error}>
          Please check the name, role and hub, and enter a valid
          email address. Email cannot be blank.
        </p>
      )}

      <details className={styles.details}>
        <summary>Bulk import from a spreadsheet</summary>

        <p className={styles.muted}>
          Paste cells copied from Excel or Google Sheets, or upload
          a CSV. Columns: Name, Role (IM, IFO, FO, Rig), Hub, Email,
          with the header in the first row. People who already
          exist (same name and hub) are skipped, so importing twice
          is safe.
        </p>

        <ImportForm />
      </details>

      <form action={addPerson} className={styles.row}>
        <input
          name="name"
          placeholder="Full name"
          aria-label="Full name"
          autoComplete="name"
          maxLength={80}
          required
        />

        {roleSelect()}
        {hubSelect()}

        <input
          name="email"
          type="email"
          placeholder="Email (required)"
          aria-label="Email (required)"
          autoComplete="email"
          required
        />

        <button type="submit">Add person</button>
      </form>

      <div className={styles.list}>
        {people.map((p) => (
          <PersonRow
            key={p.person_id}
            person={p}
            hubs={hubs}
          />
        ))}
      </div>
    </main>
  );
}