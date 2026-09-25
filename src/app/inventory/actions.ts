"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { planCorrection } from "@/lib/correction";
import { getStore } from "@/lib/store";

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

  const plan = planCorrection(
    ids.map((id) => found.get(id)!),
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
      now: new Date().toISOString(),
      newId: (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`,
    },
  );
  if (plan.errors.length) redirect(backTo(back, { error: `${plan.errors.join(" ")} Nothing was saved.` }));

  if (plan.items.length) await store.commitBatch(plan.events, plan.items);
  redirect(backTo(back, { done: String(plan.items.length), same: String(plan.unchanged.length) }));
}
