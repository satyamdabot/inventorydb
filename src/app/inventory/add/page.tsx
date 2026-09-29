import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import styles from "../../handover/form.module.css";
import { addItem } from "./actions";

export default async function AddItemPage({ searchParams }: PageProps<"/inventory/add">) {
  await requireRole("admin", "im");
  const sp = await searchParams;
  const hubs = (await getStore().list("hubs")).filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/inventory">← Inventory</Link>
      </p>
      <h1>Add a card</h1>
      <p className={styles.muted}>
        For a card that isn&apos;t in the inventory yet. It starts in stock at the hub you choose, with its
        own history from today.
      </p>
      {one(sp.done) && (
        <p className={styles.ok}>
          Added {one(sp.done)}. <Link href={`/inventory/${one(sp.done)}`}>View it</Link>, or add another below.
        </p>
      )}
      {one(sp.error) && <p className={styles.error}>{one(sp.error)}</p>}

      <form action={addItem} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="itemId">
            Serial
          </label>
          <div className={styles.control}>
            <input id="itemId" name="itemId" type="text" autoFocus required autoComplete="off" placeholder="Scan or type the QR code's serial" />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="homeHub">
            Home hub
          </label>
          <div className={styles.control}>
            <select id="homeHub" name="homeHub" defaultValue="" required>
              <option value="" disabled>
                Select a hub
              </option>
              {hubs.map((h) => (
                <option key={h.hub_id} value={h.hub_id}>
                  {h.name}
                </option>
              ))}
            </select>
            <p className={styles.hint}>The card starts in stock here.</p>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="prismNo">
            Prism no.
          </label>
          <div className={styles.control}>
            <input id="prismNo" name="prismNo" type="text" />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="brand">
            Brand
          </label>
          <div className={styles.control}>
            <input id="brand" name="brand" type="text" />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="model">
            Model
          </label>
          <div className={styles.control}>
            <input id="model" name="model" type="text" />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="price">
            Price
          </label>
          <div className={styles.control}>
            <input id="price" name="price" type="text" inputMode="decimal" placeholder="e.g. 7500" />
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit">Add card</button>
        </div>
      </form>
    </main>
  );
}
