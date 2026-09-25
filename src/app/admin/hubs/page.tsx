import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";
import styles from "../admin.module.css";
import { addHub, saveHub } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Please enter a valid name.",
  exists: "A hub with that name already exists.",
};

export default async function HubsPage({ searchParams }: PageProps<"/admin/hubs">) {
  await requireRole("admin");
  const { error } = await searchParams;
  const hubs = (await getStore().list("hubs")).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Hubs</h1>
      <p className={styles.muted}>
        {hubs.length} hubs. Deactivate a hub instead of deleting it so history stays intact.
      </p>
      {typeof error === "string" && ERRORS[error] && <p className={styles.error}>{ERRORS[error]}</p>}

      <form action={addHub} className={styles.row}>
        <input name="name" placeholder="New hub name" required />
        <input name="city" placeholder="City (optional)" />
        <label>
          <input type="checkbox" name="is_central" /> Central
        </label>
        <button type="submit">Add hub</button>
      </form>

      <div className={styles.list}>
        {hubs.map((h) => (
          <form key={h.hub_id} action={saveHub} className={styles.row}>
            <input type="hidden" name="hub_id" value={h.hub_id} />
            <input name="name" defaultValue={h.name} required />
            <input name="city" defaultValue={h.city} />
            <label>
              <input type="checkbox" name="is_central" defaultChecked={h.is_central === "true"} /> Central
            </label>
            <label>
              <input type="checkbox" name="active" defaultChecked={h.active !== "false"} /> Active
            </label>
            <button type="submit">Save</button>
          </form>
        ))}
      </div>
    </main>
  );
}
