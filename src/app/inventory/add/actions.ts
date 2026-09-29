"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { planAddItem } from "@/lib/add-item";
import { getStore } from "@/lib/store";
import { istTimestamp } from "@/lib/time";

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
  const plan = planAddItem(
    input,
    items,
    { hubs, by: user.email ?? "unknown", now: istTimestamp(), newId: (prefix) => `${prefix}-${randomUUID().slice(0, 8)}` },
  );
  if (plan.errors.length) {
    redirect(`/inventory/add?${new URLSearchParams({ error: plan.errors.join(" ") })}`);
  }

  await store.commitBatch([plan.event!], [plan.item!]);
  redirect(`/inventory/add?${new URLSearchParams({ done: plan.item!.item_id })}`);
}
