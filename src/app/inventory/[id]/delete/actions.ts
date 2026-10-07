"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";

export async function deleteInventoryItem(
  formData: FormData
): Promise<void> {
  // Server-side protection, even if someone bypasses the UI.
  await requireRole("admin");

  const itemId = String(
    formData.get("itemId") ?? ""
  ).trim();

  const confirmation = String(
    formData.get("confirmation") ?? ""
  );

  const acknowledged =
    formData.get("deleteHistory") === "yes";

  if (!itemId) {
    redirect(
      `/inventory?${new URLSearchParams({
        error: "An item ID is required.",
      })}`
    );
  }

  const deletePage =
    `/inventory/${encodeURIComponent(itemId)}/delete`;

  if (
    confirmation !== itemId ||
    !acknowledged
  ) {
    redirect(
      `${deletePage}?${new URLSearchParams({
        error:
          "Enter the exact serial and confirm that its history will also be deleted.",
      })}`
    );
  }

  let failure = false;

  try {
    await getStore().deleteItemAndHistory(itemId);
  } catch (error) {
    // Detailed diagnostic stays on the server.
    console.error("Inventory deletion failed:", error);
    failure = true;
  }

  // Keep redirects outside try/catch.
  if (failure) {
    redirect(
      `${deletePage}?${new URLSearchParams({
        error:
          "Deletion could not be confirmed. Check inventory and server logs before retrying. The active backend must support deletion.",
      })}`
    );
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/my");
  revalidatePath("/dashboard/hub/[id]", "page");
  revalidatePath("/handover/receipt/[batch]", "page");

  redirect(
    `/inventory?${new URLSearchParams({
      deleted: itemId,
    })}`
  );
}