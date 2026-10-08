"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { deleteInventoryItem } from "./actions";

/**
 * Render inside the form so useFormStatus can track submission.
 */
function DeleteFields({
  itemId,
  ready,
}: {
  itemId: string;
  ready: boolean;
}) {
  const { pending } = useFormStatus();

  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const canDelete =
    ready &&
    !pending &&
    confirmation === itemId &&
    acknowledged;

  return (
    <>
      {/* Always submit the actual item ID. */}
      <input
        type="hidden"
        name="itemId"
        value={itemId}
      />

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span>
          Type <strong>{itemId}</strong> to confirm:
        </span>

        <input
          name="confirmation"
          type="text"
          value={confirmation}
          onChange={(event) =>
            setConfirmation(event.target.value)
          }
          readOnly={pending}
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="Enter the exact serial"
          style={{
            padding: 12,
            border: "1px solid #94a3b8",
            borderRadius: 6,
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      </label>

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <input
          type="checkbox"
          name="deleteHistory"
          value="yes"
          checked={acknowledged}
          onChange={(event) =>
            setAcknowledged(event.target.checked)
          }
          disabled={pending}
          required
        />

        <span>
          I understand that this permanently removes the item
          and its associated event history.
        </span>
      </label>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
        }}
      >
        <button
          type="submit"
          disabled={!canDelete}
          style={{
            padding: "10px 16px",
            border: 0,
            borderRadius: 6,
            backgroundColor: "#b91c1c",
            color: "#ffffff",
            fontWeight: 700,
            cursor: !canDelete ? "not-allowed" : "pointer",
            opacity: !canDelete ? 0.6 : 1,
          }}
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>

        {!pending && (
          <Link href="/inventory">
            Cancel
          </Link>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        style={{ margin: 0, fontSize: 14 }}
      >
        {pending
          ? "Deletion is being processed. Please wait."
          : "A final confirmation popup will appear before deletion."}
      </p>
    </>
  );
}

export default function DeleteConfirmationForm({
  itemId,
}: {
  itemId: string;
}) {
  const [ready, setReady] = useState(false);

  // Do not enable deletion until the popup handler is available.
  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <form
      action={deleteInventoryItem}
      onSubmit={(event) => {
        if (!ready) {
          event.preventDefault();
          return;
        }

        const formData = new FormData(event.currentTarget);

        const confirmation = String(
          formData.get("confirmation") ?? ""
        );

        const acknowledged =
          formData.get("deleteHistory") === "yes";

        // Extra browser-side check.
        // The server must validate these values independently.
        if (
          confirmation !== itemId ||
          !acknowledged
        ) {
          event.preventDefault();
          return;
        }

        // FINAL CONFIRMATION POPUP:
        // Cancel prevents the delete action from being submitted.
        const confirmed = window.confirm(
          `Are you sure you want to permanently delete "${itemId}"?\n\n` +
            "This will also delete its associated event history and affect historical receipts and activity reports.\n\n" +
            "This cannot be undone from the app.\n\n" +
            "Click OK to delete, or Cancel to keep the item."
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        marginTop: 20,
      }}
    >
      <DeleteFields itemId={itemId} ready={ready} />

      <noscript>
        JavaScript must be enabled to confirm deletion.
      </noscript>
    </form>
  );
}