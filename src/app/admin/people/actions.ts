"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";
import { peopleUrl } from "./filters";

// Email is required, and no two people may share one (it is how a login is linked to a person).
const PersonInput = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["im", "ifo", "fo", "rig"]),
  hub: z.string().min(1),
  email: z.email(),
});

function parse(formData: FormData) {
  return PersonInput.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    hub: formData.get("hub"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });
}

/** Checks a person's details against the sheet. Returns an error code, or "" when they can be saved. */
async function check(formData: FormData, personId?: string) {
  const parsed = parse(formData);
  if (!parsed.success) return { code: "invalid" } as const;
  const store = getStore();
  const [hubs, people] = await Promise.all([store.list("hubs"), store.list("people")]);
  if (!hubs.some((h) => h.hub_id === parsed.data.hub)) return { code: "invalid" } as const;
  if (personId && !people.some((p) => p.person_id === personId)) return { code: "person_not_found" } as const;
  const taken = people.some((p) => p.person_id !== personId && p.linked_user.trim().toLowerCase() === parsed.data.email);
  if (taken) return { code: "email_exists" } as const;
  return { code: "", data: parsed.data } as const;
}

export async function addPerson(formData: FormData) {
  await requireRole("admin", "im");
  const keep = String(formData.get("keep") ?? "");
  const result = await check(formData);
  if (!result.data) redirect(peopleUrl(keep, { error: result.code }));

  await getStore().upsert("people", [
    {
      person_id: `p-${randomUUID().slice(0, 8)}`,
      name: result.data.name,
      role: result.data.role,
      hub: result.data.hub,
      linked_user: result.data.email,
      active: "true",
    },
  ]);
  revalidatePath("/admin/people");
  redirect(peopleUrl(keep, { done: "added" }));
}

// person_id never changes, so past events keep pointing at the right person after edits.
export async function savePerson(formData: FormData) {
  await requireRole("admin", "im");
  const keep = String(formData.get("keep") ?? "");
  const person_id = String(formData.get("person_id") ?? "");
  const result = await check(formData, person_id || "-");
  if (!result.data) redirect(peopleUrl(keep, { error: result.code }));

  await getStore().upsert("people", [
    {
      person_id,
      name: result.data.name,
      role: result.data.role,
      hub: result.data.hub,
      linked_user: result.data.email,
      active: formData.get("active") === "on" ? "true" : "false",
    },
  ]);
  revalidatePath("/admin/people");
  redirect(peopleUrl(keep, { done: "saved" }));
}