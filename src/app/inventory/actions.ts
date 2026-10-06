"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { planAddItem } from "@/lib/add-item";
import { findAsset } from "@/lib/asset-lookup";
import { loadAssetRecords } from "@/lib/asset-sheet";
import { requireRole } from "@/lib/authz";
import { planCorrection } from "@/lib/correction";
import { getStore } from "@/lib/store";
import { istTimestamp } from "@/lib/time";

// Only allow redirects back to inventory pages.
const SAFE_BACK = /^\/inventory(\/[A-Za-z0-9_-]+)?$/;

function backTo(
  path: string,
  params: Record<string, string>
): string {
  return `${path}?${new URLSearchParams(params)}`;
}

// Refresh pages that display inventory data.
function refreshInventoryPages() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/hub/[id]", "page");
}

/**
 * ADMIN CORRECTION
 *
 * Correct status, current hub, holder or home hub.
 * Supports selected checkboxes and scanned item IDs.
 */
export async function applyCorrection(formData: FormData) {
  const user = await requireRole("admin");

  const backRaw = String(formData.get("back") ?? "");
  const back = SAFE_BACK.test(backRaw)
    ? backRaw
    : "/inventory";

  // Combine checkbox selections with scanned or pasted IDs.
  const scanned = String(formData.get("scanned") ?? "")
    .split(/[\s,]+/);

  const ids = [
    ...new Set(
      [
        ...formData.getAll("ids").map(String),
        ...scanned,
      ]
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];

  if (!ids.length) {
    redirect(
      backTo(back, {
        error: "Tick or scan at least one item.",
      })
    );
  }

  const store = getStore();

  const [found, hubs, people] = await Promise.all([
    store.getItemsByIds(ids),
    store.list("hubs"),
    store.list("people"),
  ]);

  // Do not partially save when some requested items are missing.
  const missing = ids.filter((id) => !found.has(id));

  if (missing.length) {
    const shown = missing.slice(0, 5).join(", ");

    redirect(
      backTo(back, {
        error: `Not found: ${shown}${
          missing.length > 5
            ? ` and ${missing.length - 5} more`
            : ""
        }. Nothing was saved.`,
      })
    );
  }

  // Different spellings of the same serial count as one item.
  const targets = [
    ...new Map(
      ids.map((id) => [
        found.get(id)!.item_id,
        found.get(id)!,
      ])
    ).values(),
  ];

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
      newId: (prefix) =>
        `${prefix}-${randomUUID().slice(0, 8)}`,
    }
  );

  if (plan.errors.length) {
    redirect(
      backTo(back, {
        error: `${plan.errors.join(" ")} Nothing was saved.`,
      })
    );
  }

  if (plan.items.length) {
    await store.commitBatch(plan.events, plan.items);
    refreshInventoryPages();
  }

  redirect(
    backTo(back, {
      done: String(plan.items.length),
      same: String(plan.unchanged.length),
    })
  );
}

/**
 * ADD ITEM
 *
 * Register a new card in stock at the selected home hub.
 * Save price in the existing price column.
 * Save capacity and card colour inside attributes JSON.
 */
export async function addItem(formData: FormData) {
  const user = await requireRole("admin", "im");

  const capacity = String(
    formData.get("capacity") ?? ""
  ).trim();

  const cardType = String(
    formData.get("cardType") ?? ""
  ).trim();

  const rawPrice = String(
    formData.get("price") ?? ""
  ).trim();

  function reject(message: string): never {
    redirect(
      `/inventory?${new URLSearchParams({
        addError: message,
      })}`
    );
  }

  // Validate supported storage values when supplied.
  if (
    capacity &&
    !["256 GB", "512 GB"].includes(capacity)
  ) {
    reject("Capacity must be 256 GB or 512 GB.");
  }

  // Validate supported card colours when supplied.
  if (
    cardType &&
    !["Black", "Green"].includes(cardType)
  ) {
    reject("Card type must be Black or Green.");
  }

  // Blank price remains allowed.
  // Nonblank prices must be non-negative numeric values.
  if (
    rawPrice &&
    (!/^\d+(?:\.\d{1,2})?$/.test(rawPrice) ||
      !Number.isFinite(Number(rawPrice)))
  ) {
    reject(
      "Enter a valid non-negative price with up to two decimal places."
    );
  }

  const input = {
    itemId: String(formData.get("itemId") ?? "").trim(),
    homeHub: String(formData.get("homeHub") ?? "").trim(),
    prismNo: String(formData.get("prismNo") ?? "").trim(),
    brand: String(formData.get("brand") ?? "").trim(),
    model: String(formData.get("model") ?? "").trim(),
    price: rawPrice,
  };

  const store = getStore();

  const [items, hubs] = await Promise.all([
    store.list("items"),
    store.list("hubs"),
  ]);

  // Keep the existing item validation and creation logic.
  const plan = planAddItem(input, items, {
    hubs,
    by: user.email ?? "unknown",
    now: istTimestamp(),
    newId: (prefix) =>
      `${prefix}-${randomUUID().slice(0, 8)}`,
  });

  if (plan.errors.length) {
    reject(plan.errors.join(" "));
  }

  if (!plan.item || !plan.event) {
    reject(
      "The item could not be prepared. Nothing was saved."
    );
  }

  const item = plan.item!;
  const event = plan.event!;

  // Preserve any attributes generated by planAddItem.
  let attributes: Record<string, unknown> = {};

  if (item.attributes?.trim()) {
    let parsed: unknown;

    // Catch JSON parsing errors only.
    // Keep redirect() outside this try/catch.
    try {
      parsed = JSON.parse(item.attributes);
    } catch {
      reject(
        "Could not read item attributes. Nothing was saved."
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      reject(
        "Invalid item attributes. Nothing was saved."
      );
    }

    attributes = parsed as Record<string, unknown>;
  }

  const itemToSave = {
    ...item,

    // Receipt and inventory amount columns read this value.
    price: rawPrice,

    // Fleet and inventory breakdowns read these JSON keys.
    attributes: JSON.stringify({
      ...attributes,
      capacity,
      card_type: cardType,
    }),
  };

  await store.commitBatch([event], [itemToSave]);

  refreshInventoryPages();

  redirect(
    `/inventory?${new URLSearchParams({
      added: itemToSave.item_id,
    })}`
  );
}

/**
 * ASSET LOOKUP
 *
 * Auto-fill Add item using a matching Asset Tag
 * from the configured reference asset sheet.
 */
export async function lookupAsset(serial: string) {
  await requireRole("admin", "im");

  const cleanedSerial = serial.trim();

  if (!cleanedSerial) {
    return null;
  }

  const records = await loadAssetRecords();
  const found = findAsset(records, cleanedSerial);

  return found
    ? {
        brand: found.brand,
        model: found.model,
        prismNo: found.prismNo,
        price: found.price,
        capacity: found.capacity ?? "",
        cardType: found.cardType ?? "",
      }
    : null;
}