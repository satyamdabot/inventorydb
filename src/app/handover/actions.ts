"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { actorOptions, allowedActors, defaultActor, resolveActor } from "@/lib/actors";
import { requireRole } from "@/lib/authz";
import { planReceive, planSend, type HandoverContext, type HandoverPlan } from "@/lib/handover";
import type { Item } from "@/lib/schema";
import { collectIds } from "@/lib/scan";
import { getStore } from "@/lib/store";
import { istTimestamp } from "@/lib/time";

const go = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params)}`;

// Shared by both flows: collect the scanned cards, plan, save all-or-nothing, redirect with the result.
async function run(
  formData: FormData,
  path: string,
  build: (targets: Item[], ctx: HandoverContext) => HandoverPlan | Promise<HandoverPlan>,
  summary: (plan: HandoverPlan) => Record<string, string>,
) {  const user = await requireRole("admin", "im");
  const ids = collectIds(String(formData.get("scanned") ?? ""), formData.getAll("ids").map(String));
  if (!ids.length) redirect(go(path, { error: "Scan or tick at least one card." }));

  const store = getStore();
  const [found, hubs, people, users] = await Promise.all([
    store.getItemsByIds(ids),
    store.list("hubs"),
    store.list("people"),
    store.list("users"),
  ]);

  // Who is recording the handover (Sent by / Received by). Only an admin may name someone else; anyone
  // else is always recorded as themselves, whatever the form says. The signed-in account is saved separately.
  const hubName = new Map(hubs.map((h) => [h.hub_id, h.name]));
  const isAdmin = user.role === "admin";
  const actor = resolveActor(
    isAdmin ? String(formData.get("by") ?? "") || defaultActor(user) : defaultActor(user),
    allowedActors(user, actorOptions(people, users, (id) => hubName.get(id) ?? id)),
  );
  if (!actor) {
    redirect(
      go(path, {
        error: isAdmin
          ? "Choose an IM or admin for who is recording this handover."
          : "Your login is not linked to an active IM. Ask an admin to link you on the Users screen.",
      }),
    );
  }

  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const shown = missing.slice(0, 5).join(", ");
    redirect(go(path, { error: `Not found: ${shown}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}. Nothing was saved.` }));
  }

  // Two spellings of the same card (SD-1 and sd-1) count once, and the stored serial is what gets used.
  const targets = [...new Map(ids.map((id) => [found.get(id)!.item_id, found.get(id)!])).values()];

  const plan = await build(
    targets,
    {
      hubs,
      people,
      actorPersonId: actor,
      by: user.email ?? "unknown",
      now: istTimestamp(),
      newId: (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`,
    },
  );
  if (plan.errors.length) redirect(go(path, { error: `${plan.errors.join(" ")} Nothing was saved.` }));

  await store.commitBatch(plan.events, plan.items);
  redirect(go(path, { done: String(plan.items.length), ...summary(plan) }));
}

export async function sendCards(formData: FormData) {
  // "Internal" submits a typed name instead of a real person_id. There's no status rule for it yet
  // (see planSend's SEND_STATUS), so it's refused here, before anything is scanned or saved, rather
  // than guessing what it should do to the card.
  if (String(formData.get("internalName") ?? "").trim()) {
    redirect(go("/handover/send", { error: "Internal handovers aren't set up yet. Nothing was saved." }));
  }

  // The person and the location are both required; planSend refuses the send if either is missing.
  const input = {
    fromHub: String(formData.get("fromHub") ?? ""),
    recipient: String(formData.get("recipient") ?? ""),
    toHub: String(formData.get("hub") ?? ""),
    note: String(formData.get("note") ?? ""),
  };
  await run(
    formData,
    "/handover/send",
    (targets, ctx) => planSend(targets, input, ctx),
    (plan): Record<string, string> => ({
      status: plan.items[0]?.status ?? "",
      person: plan.items[0]?.current_holder ?? "",
      hub: plan.items[0]?.current_hub ?? "",
      batch: plan.events[0]?.batch_id ?? "",
    }),
  );
}

export async function receiveCards(formData: FormData) {
  const hub = String(formData.get("hub") ?? "");
  const note = String(formData.get("note") ?? "");
  const expectedRaw = String(formData.get("expected") ?? "").trim();
  const expected = expectedRaw === "" ? undefined : Number(expectedRaw);
  if (expected !== undefined && (!Number.isInteger(expected) || expected < 0)) {
    redirect(go("/handover/receive", { error: "Expected count must be a whole number." }));
  }
  await run(
    formData,
    "/handover/receive",
    (targets, ctx) => planReceive(targets, { hub, note, expected }, ctx),
    (plan): Record<string, string> => (plan.mismatch ? { mismatch: plan.mismatch } : {}),
  );
}
