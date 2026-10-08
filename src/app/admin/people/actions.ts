"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";

// Both Add and Edit require a valid email.
const PersonInput = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["im", "ifo", "fo", "rig"]),
  hub: z.string().trim().min(1),
  email: z.email("Enter a valid email address"),
});

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parse(formData: FormData) {
  return PersonInput.safeParse({
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    hub: String(formData.get("hub") ?? ""),
    email: normalizeEmail(
      String(formData.get("email") ?? "")
    ),
  });
}

function fail(
  error: "invalid" | "email_exists" | "person_not_found"
): never {
  redirect(
    `/admin/people?${new URLSearchParams({ error })}`
  );
}

function refreshPages() {
  revalidatePath("/admin/people");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/my");
  revalidatePath("/inventory");
  revalidatePath("/handover/send");
  revalidatePath("/handover/receive");
}

/** Add a person after checking email uniqueness. */
export async function addPerson(formData: FormData) {
  await requireRole("admin", "im");

  const parsed = parse(formData);

  if (!parsed.success) {
    fail("invalid");
  }

  const input = parsed.data;
  const store = getStore();

  const [people, hubs] = await Promise.all([
    store.list("people"),
    store.list("hubs"),
  ]);

  // New people must be assigned to an active hub.
  const validHub = hubs.some(
    (hub) =>
      hub.hub_id === input.hub &&
      hub.active !== "false"
  );

  if (!validHub) {
    fail("invalid");
  }

  // Include inactive people so their email is not reassigned.
  const duplicate = people.some(
    (person) =>
      normalizeEmail(person.linked_user ?? "") ===
      input.email
  );

  if (duplicate) {
    fail("email_exists");
  }

  await store.upsert("people", [
    {
      person_id: `p-${randomUUID()}`,
      name: input.name,
      role: input.role,
      hub: input.hub,
      linked_user: input.email,
      active: "true",
    },
  ]);

  refreshPages();
  redirect("/admin/people?done=added");
}

/** Save edits without changing the person's historical ID. */
export async function savePerson(formData: FormData) {
  await requireRole("admin", "im");

  const personId = String(
    formData.get("person_id") ?? ""
  ).trim();

  const parsed = parse(formData);

  if (!personId || !parsed.success) {
    fail("invalid");
  }

  const input = parsed.data;
  const store = getStore();

  const [people, hubs] = await Promise.all([
    store.list("people"),
    store.list("hubs"),
  ]);

  const existing = people.find(
    (person) => person.person_id === personId
  );

  if (!existing) {
    fail("person_not_found");
  }

  // Retaining an existing inactive hub is allowed.
  // Moving to another hub requires that hub to be active.
  const validHub = hubs.some(
    (hub) =>
      hub.hub_id === input.hub &&
      (hub.active !== "false" || existing.hub === input.hub)
  );

  if (!validHub) {
    fail("invalid");
  }

  // A person can keep their own email, but cannot use another's.
  const duplicate = people.some(
    (person) =>
      person.person_id !== personId &&
      normalizeEmail(person.linked_user ?? "") ===
        input.email
  );

  if (duplicate) {
    fail("email_exists");
  }

  await store.upsert("people", [
    {
      person_id: personId,
      name: input.name,
      role: input.role,
      hub: input.hub,
      linked_user: input.email,
      active:
        formData.get("active") === "on"
          ? "true"
          : "false",
    },
  ]);

  refreshPages();
  redirect("/admin/people?done=saved");
}