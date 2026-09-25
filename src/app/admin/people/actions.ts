"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";

const PersonInput = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["im", "ifo", "fo", "rig"]),
  hub: z.string().min(1),
  email: z.union([z.literal(""), z.email()]),
});

function parse(formData: FormData) {
  return PersonInput.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    hub: formData.get("hub"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });
}

async function hubExists(hub: string) {
  return (await getStore().list("hubs")).some((h) => h.hub_id === hub);
}

export async function addPerson(formData: FormData) {
  await requireRole("admin");
  const parsed = parse(formData);
  if (!parsed.success || !(await hubExists(parsed.data.hub))) redirect("/admin/people?error=invalid");

  await getStore().upsert("people", [
    {
      person_id: `p-${randomUUID().slice(0, 8)}`,
      name: parsed.data.name,
      role: parsed.data.role,
      hub: parsed.data.hub,
      linked_user: parsed.data.email,
      active: "true",
    },
  ]);
  revalidatePath("/admin/people");
}

// person_id never changes, so past events keep pointing at the right person after edits.
export async function savePerson(formData: FormData) {
  await requireRole("admin");
  const person_id = String(formData.get("person_id") ?? "");
  const parsed = parse(formData);
  const store = getStore();
  if (
    !person_id ||
    !parsed.success ||
    !(await hubExists(parsed.data.hub)) ||
    !(await store.list("people")).some((p) => p.person_id === person_id)
  ) {
    redirect("/admin/people?error=invalid");
  }
  await store.upsert("people", [
    {
      person_id,
      name: parsed.data.name,
      role: parsed.data.role,
      hub: parsed.data.hub,
      linked_user: parsed.data.email,
      active: formData.get("active") === "on" ? "true" : "false",
    },
  ]);
  revalidatePath("/admin/people");
}
