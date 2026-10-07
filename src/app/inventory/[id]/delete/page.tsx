import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { STATUS_LABELS, one } from "@/lib/labels";
import { getStore } from "@/lib/store";
import { deleteInventoryItem } from "./actions";

export default async function DeleteItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
  }>;
}) {
  // Non-admin users cannot open this page.
  await requireRole("admin");

  const { id } = await params;
  const sp = await searchParams;
  const store = getStore();

  const item = await store.getItem(id);

  if (!item) {
    notFound();
  }

  const history = await store.getHistory(item.item_id);

  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <p>
        <Link href="/inventory">← Inventory</Link>
      </p>

      <h1>Delete inventory item</h1>

      <p>
        This operation is available only to administrators.
      </p>

      {one(sp.error) && (
        <p
          role="alert"
          style={{
            color: "#991b1b",
            backgroundColor: "#fef2f2",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {one(sp.error)}
        </p>
      )}

      <section
        style={{
          border: "1px solid #dc2626",
          borderRadius: 12,
          padding: 20,
          marginTop: 20,
        }}
      >
        <h2>{item.item_id}</h2>

        <dl>
          <dt>Brand</dt>
          <dd>{item.brand || "—"}</dd>

          <dt>Model</dt>
          <dd>{item.model || "—"}</dd>

          <dt>Status</dt>
          <dd>
            {STATUS_LABELS[item.status] ?? item.status}
          </dd>

          <dt>Associated event records</dt>
          <dd>{history.length}</dd>
        </dl>

        <p style={{ color: "#b91c1c", fontWeight: 700 }}>
          This permanently deletes the item and its associated
          event history.
        </p>

        <p>
          Historical receipts and activity reports will change.
          A receipt containing only this item may no longer
          exist. This cannot be undone from the app.
        </p>

        <p>
          Back up the inventory spreadsheet and pause other
          inventory writes or manual sheet edits before proceeding.
        </p>

        <form
          action={deleteInventoryItem}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 20,
          }}
        >
          <input
            type="hidden"
            name="itemId"
            value={item.item_id}
          />

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span>
              Type <strong>{item.item_id}</strong> to confirm:
            </span>

            <input
              name="confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="Enter the exact serial"
              style={{
                padding: 12,
                border: "1px solid #94a3b8",
                borderRadius: 6,
              }}
            />
          </label>

          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              name="deleteHistory"
              value="yes"
              required
            />

            <span>
              I understand that the item and all its associated
              event records will be permanently deleted.
            </span>
          </label>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 16,
            }}
          >
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                border: 0,
                borderRadius: 6,
                backgroundColor: "#b91c1c",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Permanently delete
            </button>

            <Link href="/inventory">Cancel</Link>
          </div>
        </form>
      </section>
    </main>
  );
}