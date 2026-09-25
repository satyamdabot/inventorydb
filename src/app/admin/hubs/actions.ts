"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { slugify } from "@/lib/slug";
import { getStore } from "@/lib/store";

const HubInput = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().max(80),
});

const flag = (v: FormDataEntryValue | null) => (v === "on" ? "true" : "false");

export async function addHub(formData: FormData) {
  await requireRole("admin");
  const parsed = HubInput.safeParse({ name: formData.get("name"), city: formData.get("city") });
  if (!parsed.success) redirect("/admin/hubs?error=invalid");

  const hub_id = slugify(parsed.data.name);
  const store = getStore();
  if (!hub_id || (await store.list("hubs")).some((h) => h.hub_id === hub_id)) {
    redirect("/admin/hubs?error=exists");
  }
  await store.upsert("hubs", [
    {
      hub_id,
      name: parsed.data.name,
      city: parsed.data.city || parsed.data.name,
      is_central: flag(formData.get("is_central")),
      active: "true",
    },
  ]);
  revalidatePath("/admin/hubs");
}

// The hub_id never changes, so history keeps pointing at the right hub after a rename.
export async function saveHub(formData: FormData) {
  await requireRole("admin");
  const hub_id = String(formData.get("hub_id") ?? "");
  const parsed = HubInput.safeParse({ name: formData.get("name"), city: formData.get("city") });
  if (!hub_id || !parsed.success) redirect("/admin/hubs?error=invalid");

  const store = getStore();
  if (!(await store.list("hubs")).some((h) => h.hub_id === hub_id)) redirect("/admin/hubs?error=invalid");
  await store.upsert("hubs", [
    {
      hub_id,
      name: parsed.data.name,
      city: parsed.data.city || parsed.data.name,
      is_central: flag(formData.get("is_central")),
      active: flag(formData.get("active")),
    },
  ]);
  revalidatePath("/admin/hubs");
}
