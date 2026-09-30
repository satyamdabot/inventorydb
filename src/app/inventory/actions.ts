"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { planAddItem } from "@/lib/add-item";
import { findAsset } from "@/lib/asset-lookup";
import { loadAssetRecords } from "@/lib/asset-sheet";
import { planCorrection } from "@/lib/correction";
import { getStore } from "@/lib/store";
import { istTimestamp } from "@/lib/time";

// Only ever redirect back into the inventory screens.
const SAFE_BACK = /^\/inventory(\/[A-Za-z0-9_-]+)?$/;

function backTo(path: string, params: Record<string, string>) {
  return `${path}?${new URLSearchParams(params)}`;
}

/** Admin correction of status / hub / holder / home hub for one or many cards. */
export async function applyCorrection(formData: FormData) {
  const user = await requireRole("admin");
  const backRaw = String(formData.get("back") ?? "");
  const back = SAFE_BACK.test(backRaw) ? backRaw : "/inventory";

  // Ticked rows plus serials typed, pasted or scanned (one per line).
  const scanned = String(formData.get("scanned") ?? "").split(/[\s,]+/);
  const ids = [...new Set([...formData.getAll("ids").map(String), ...scanned].map((s) => s.trim()).filter(Boolean))];
  if (!ids.length) redirect(backTo(back, { error: "Tick or scan at least one card." }));

  const store = getStore();
  const [found, hubs, people] = await Promise.all([
    store.getItemsByIds(ids),
    store.list("hubs"),
    store.list("people"),
  ]);
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const shown = missing.slice(0, 5).join(", ");
    redirect(backTo(back, { error: `Not found: ${shown}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}. Nothing was saved.` }));
  }

  // Two spellings of the same card (SD-1 and sd-1) count once, and the stored serial is what gets used.
  const targets = [...new Map(ids.map((id) => [found.get(id)!.item_id, found.get(id)!])).values()];

  const plan = planCorrection(
    targets,
    {
      status: String(formData.get("status") ?? ""),
      hub: String(formData.get("hub") ?? ""),
      holder: String(formData.get("holder") ?? ""),
      homeHub: String(formData.get("homeHub") ?? ""),
      note: String(formData.get("note") ?? ""),
    },
    {
      hubs,
      people,
      by: user.email ?? "unknown",
      now: istTimestamp(),
      newId: (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`,
    },
  );
  if (plan.errors.length) redirect(backTo(back, { error: `${plan.errors.join(" ")} Nothing was saved.` }));

  if (plan.items.length) await store.commitBatch(plan.events, plan.items);
  redirect(backTo(back, { done: String(plan.items.length), same: String(plan.unchanged.length) }));
}

/** Register a brand-new card, in stock at the chosen hub. Admin or IM. */
export async function addItem(formData: FormData) {
  const user = await requireRole("admin", "im");
  const input = {
    itemId: String(formData.get("itemId") ?? ""),
    homeHub: String(formData.get("homeHub") ?? ""),
    prismNo: String(formData.get("prismNo") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    model: String(formData.get("model") ?? ""),
    price: String(formData.get("price") ?? ""),
  };

  const store = getStore();
  const [items, hubs] = await Promise.all([store.list("items"), store.list("hubs")]);
  const plan = planAddItem(input, items, {
    hubs,
    by: user.email ?? "unknown",
    now: istTimestamp(),
    newId: (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`,
  });
  if (plan.errors.length) redirect(`/inventory?${new URLSearchParams({ addError: plan.errors.join(" ") })}`);

  await store.commitBatch([plan.event!], [plan.item!]);
  redirect(`/inventory?${new URLSearchParams({ added: plan.item!.item_id })}`);
}

/** Look up brand, model, prism no. and price for a serial from the customer's asset sheet, to auto-fill Add a card. */
export async function lookupAsset(serial: string) {
  await requireRole("admin", "im");
  const records = await loadAssetRecords();
  const found = findAsset(records, serial);
  return found ? { brand: found.brand, model: found.model, prismNo: found.prismNo, price: found.price } : null;
}
