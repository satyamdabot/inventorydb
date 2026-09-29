"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { planPeopleImport } from "@/lib/import-people";
import { getStore } from "@/lib/store";

export type ImportState =
  | { stage: "idle" }
  | {
      stage: "preview";
      adds: { name: string; role: string; hub: string }[];
      skipped: string[];
      errors: string[];
    }
  | { stage: "done"; added: number; skipped: number };

// One action for both buttons. "preview" only checks; "commit" re-checks the same text and saves,
// and refuses to save anything while any row has an error.
export async function runImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireRole("admin", "im");
  const text = String(formData.get("text") ?? "");
  const store = getStore();
  const [hubs, people] = await Promise.all([store.list("hubs"), store.list("people")]);
  const plan = planPeopleImport(text, hubs, people, () => `p-${randomUUID().slice(0, 8)}`);

  if (formData.get("intent") === "commit" && plan.errors.length === 0 && plan.adds.length > 0) {
    await store.upsert("people", plan.adds);
    revalidatePath("/admin/people");
    return { stage: "done", added: plan.adds.length, skipped: plan.skipped.length };
  }

  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  return {
    stage: "preview",
    adds: plan.adds.map((p) => ({ name: p.name, role: p.role, hub: hubName.get(p.hub) ?? p.hub })),
    skipped: plan.skipped,
    errors: plan.errors,
  };
}
