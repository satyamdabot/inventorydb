"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";
import { istTimestamp } from "@/lib/time";

// Only send the user back to the receipts page.
function backUrl(formData: FormData, params: Record<string, string>) {
  const back = String(formData.get("back") ?? "/handover/receipts");
  const url = new URL(back.startsWith("/handover/receipts") ? back : "/handover/receipts", "http://x");
  url.searchParams.delete("saved");
  url.searchParams.delete("error");
  url.searchParams.delete("deleted");
  url.searchParams.delete("restored");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return `${url.pathname}?${url.searchParams}`;
}

async function logEdit(
  admin: { email?: string | null; name?: string | null },
  batchId: string,
  field: string,
  oldValue: string,
  newValue: string
) {
  // A logging problem must not undo or hide a saved change.
  try {
    await getStore().logReceiptEdit({
      edit_id: `r-${randomUUID().slice(0, 8)}`,
      edited_at: istTimestamp(),
      edited_by_email: admin.email ?? "unknown",
      edited_by_name: admin.name ?? "",
      batch_id: batchId,
      field,
      old_value: oldValue,
      new_value: newValue,
    });
  } catch (error) {
    console.error(`Receipt ${batchId}: the edit log could not be written:`, error);
  }
}

function refresh() {
  revalidatePath("/handover/receipts");
  revalidatePath("/handover/receipt/[batch]", "page");
}

/** ADMIN ONLY: change the note on a past receipt. */
export async function updateReceiptNote(formData: FormData) {
  const admin = await requireRole("admin");

  const batchId = String(formData.get("batch") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);

  if (!batchId) redirect(backUrl(formData, { error: "Missing receipt." }));

  const store = getStore();
  const events = (await store.list("events")).filter((e) => e.batch_id === batchId);
  if (events.length === 0) {
    redirect(backUrl(formData, { error: `Receipt ${batchId} was not found.` }));
  }

  const oldNote = events[0].note ?? "";
  if (oldNote !== note) {
    await store.upsert("events", events.map((e) => ({ ...e, note })));
    await logEdit(admin, batchId, "note", oldNote, note);
    refresh();
  }

  redirect(backUrl(formData, { saved: batchId }));
}

/**
 * ADMIN ONLY: delete a receipt from the Receipts list.
 * Item history is NOT removed, so item status stays correct.
 * Admins can restore it later.
 */
export async function deleteReceipt(formData: FormData) {
  const admin = await requireRole("admin");

  const batchId = String(formData.get("batch") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!batchId) redirect(backUrl(formData, { error: "Missing receipt." }));

  await logEdit(admin, batchId, "deleted", "no", reason ? `yes — ${reason}` : "yes");
  refresh();

  redirect(backUrl(formData, { deleted: batchId }));
}

/** ADMIN ONLY: bring back a deleted receipt. */
export async function restoreReceipt(formData: FormData) {
  const admin = await requireRole("admin");

  const batchId = String(formData.get("batch") ?? "").trim();
  if (!batchId) redirect(backUrl(formData, { error: "Missing receipt." }));

  await logEdit(admin, batchId, "deleted", "yes", "no");
  refresh();

  redirect(backUrl(formData, { restored: batchId }));
}