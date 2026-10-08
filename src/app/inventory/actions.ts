"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { planAddItem } from "@/lib/add-item";
import {
  findAsset,
  normalizeCapacity,
} from "@/lib/asset-lookup";
import { loadAssetRecords } from "@/lib/asset-sheet";
import { requireRole } from "@/lib/authz";
import { planCorrection } from "@/lib/correction";
import { getStore } from "@/lib/store";
import { istTimestamp } from "@/lib/time";

// Only redirect to inventory pages.
const SAFE_BACK = /^\/inventory(\/[A-Za-z0-9_-]+)?$/;

function backTo(
  path: string,
  params: Record<string, string>
): string {
  return `${path}?${new URLSearchParams(params)}`;
}

// Fixed penalty based on storage.
function penaltyForCapacity(capacity: string): string {
  if (capacity === "256 GB") return "10000";
  if (capacity === "512 GB") return "20000";
  return "";
}

function refreshInventoryPages() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/my");
  revalidatePath("/dashboard/hub/[id]", "page");
}

/**
 * CORRECTIONS: Admin only.
 * IM and Rig do not gain correction permission.
 */
export async function applyCorrection(formData: FormData) {
  const user = await requireRole("admin");

  const backRaw = String(formData.get("back") ?? "");
  const back = SAFE_BACK.test(backRaw)
    ? backRaw
    : "/inventory";

  const scanned = String(formData.get("scanned") ?? "")
    .split(/[\s,]+/);

  const ids = [
    ...new Set(
      [...formData.getAll("ids").map(String), ...scanned]
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

  // Different spellings of the same stored serial count once.
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
 * ADD ITEM: Admin, IM and Rig.
 *
 * Blank homeHub defaults to active Bangalore.
 * Store storage/colour in attributes and penalty in price.
 */
export async function addItem(formData: FormData) {
  const user = await requireRole("admin", "im", "rig");

  const capacity = normalizeCapacity(
    String(formData.get("capacity") ?? "")
  );

  const cardType = String(
    formData.get("cardType") ?? ""
  ).trim();

  function reject(message: string): never {
    redirect(
      `/inventory?${new URLSearchParams({
        addError: message,
      })}`
    );
  }

  if (!["256 GB", "512 GB"].includes(capacity)) {
    reject(
      "Select 256 GB or 512 GB to calculate the penalty."
    );
  }

  if (
    cardType &&
    !["Black", "Green"].includes(cardType)
  ) {
    reject("Card type must be Black or Green.");
  }

  // Calculate on the server; ignore the submitted price.
  const price = penaltyForCapacity(capacity);

  const input = {
    itemId: String(formData.get("itemId") ?? "").trim(),
    homeHub: String(formData.get("homeHub") ?? "").trim(),
    prismNo: String(formData.get("prismNo") ?? "").trim(),
    brand: String(formData.get("brand") ?? "").trim(),
    model: String(formData.get("model") ?? "").trim(),
    price,
  };

  const store = getStore();

  const [items, hubs] = await Promise.all([
    store.list("items"),
    store.list("hubs"),
  ]);

  const activeHubs = hubs.filter(
    (hub) => hub.active !== "false"
  );

  // No manual hub selection is necessary when Bangalore exists.
  if (!input.homeHub) {
    const bangaloreHub =
      activeHubs.find(
        (hub) =>
          hub.hub_id.trim().toLowerCase() === "bangalore"
      ) ??
      activeHubs.find(
        (hub) =>
          hub.name.trim().toLowerCase() === "bangalore"
      );

    if (!bangaloreHub) {
      reject(
        "The default Bangalore hub is unavailable. Please select another home hub."
      );
    }

    input.homeHub = bangaloreHub.hub_id;
  }

  // Validate submitted values on the server, not only in the dropdown.
  if (
    !activeHubs.some(
      (hub) => hub.hub_id === input.homeHub
    )
  ) {
    reject("Please select a valid active home hub.");
  }

  // Preserve the existing item validation and creation plan.
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

  const item = plan.item;
  const event = plan.event;

  if (!item || !event) {
    reject(
      "The item could not be prepared. Nothing was saved."
    );
  }

  // Preserve attributes already generated by planAddItem.
  let attributes: Record<string, unknown> = {};

  if (item.attributes?.trim()) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(item.attributes);
    } catch {
      reject(
        "Could not read item attributes. Nothing was saved."
      );
    }

    // Keep redirects outside the JSON-parsing try/catch.
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
    price,
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
 * ASSET LOOKUP: Admin, IM and Rig.
 * Home hub is not fetched from the reference asset sheet.
 */
export async function lookupAsset(serial: string) {
  await requireRole("admin", "im", "rig");

  const cleanedSerial = serial.trim();

  if (!cleanedSerial) return null;

  const records = await loadAssetRecords();
  const found = findAsset(records, cleanedSerial);

  if (!found) return null;

  const capacity = normalizeCapacity(
    found.capacity ?? ""
  );

  return {
    brand: found.brand,
    model: found.model,
    prismNo: found.prismNo,
    capacity,
    cardType: found.cardType ?? "",
    price: penaltyForCapacity(capacity),
  };
}