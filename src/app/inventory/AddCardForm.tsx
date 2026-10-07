"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useFormStatus } from "react-dom";
import styles from "../admin/admin.module.css";
import { addItem, lookupAsset } from "./actions";

type Hubs = {
  hub_id: string;
  name: string;
}[];

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px 12px",
};

function AddButton({ lookupBusy }: { lookupBusy: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={lookupBusy || pending}>
      {pending ? "Saving…" : "Add item"}
    </button>
  );
}

export default function AddCardForm({ hubs }: { hubs: Hubs }) {
  const [serial, setSerial] = useState("");
  const [prismNo, setPrismNo] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [cardType, setCardType] = useState("");
  const [note, setNote] = useState("");

  const [lookingUp, setLookingUp] = useState(false);
  const [waitingToLookup, setWaitingToLookup] = useState(false);

  // Track the latest request so older responses cannot overwrite it.
  const requestId = useRef(0);
  const lastSuccessfulSerial = useRef("");
  const activeLookupSerial = useRef("");

  // Timer used to wait until typing/scanning pauses.
  const lookupTimer = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  const lookupBusy = lookingUp || waitingToLookup;

  // Cancel queued work and invalidate requests when the form unmounts.
  useEffect(() => {
    return () => {
      if (lookupTimer.current !== null) {
        clearTimeout(lookupTimer.current);
        lookupTimer.current = null;
      }

      requestId.current += 1;
      activeLookupSerial.current = "";
    };
  }, []);

  function clearDetails() {
    setPrismNo("");
    setBrand("");
    setModel("");
    setPrice("");
    setCapacity("");
    setCardType("");
  }

  function cancelScheduledLookup() {
    if (lookupTimer.current !== null) {
      clearTimeout(lookupTimer.current);
      lookupTimer.current = null;
    }

    setWaitingToLookup(false);
  }

  function changeSerial(value: string) {
    cancelScheduledLookup();

    // Ignore any response still loading for the previous serial.
    requestId.current += 1;
    lastSuccessfulSerial.current = "";
    activeLookupSerial.current = "";

    setSerial(value);
    setLookingUp(false);
    clearDetails();

    const trimmed = value.trim();

    if (!trimmed) {
      setNote("");
      return;
    }

    setWaitingToLookup(true);
    setNote("");

    // Automatically fetch 600ms after typing stops.
    lookupTimer.current = setTimeout(() => {
      lookupTimer.current = null;
      void lookup(trimmed);
    }, 600);
  }

  async function lookup(value: string, force = false) {
    cancelScheduledLookup();

    const trimmed = value.trim();

    if (!trimmed) {
      setNote("Enter or scan an Asset Tag first.");
      return;
    }

    const normalized = trimmed.toLowerCase();

    // Avoid duplicate requests for the same card.
    if (activeLookupSerial.current === normalized) return;

    // Preserve manual edits after a successful automatic lookup.
    // The Fetch details button explicitly allows fetching again.
    if (
      !force &&
      lastSuccessfulSerial.current === normalized
    ) {
      return;
    }

    const currentRequest = ++requestId.current;
    activeLookupSerial.current = normalized;

    setLookingUp(true);
    setNote("");

    try {
      const found = await lookupAsset(trimmed);

      if (currentRequest !== requestId.current) return;

      if (!found) {
        lastSuccessfulSerial.current = "";
        clearDetails();

        setNote(
          "No matching Asset Tag was found. Enter the card details manually."
        );
        return;
      }

      // Fill every field returned by the reference-sheet lookup.
      setPrismNo(found.prismNo ?? "");
      setBrand(found.brand ?? "");
      setModel(found.model ?? "");
      setPrice(found.price ?? "");
      setCapacity(found.capacity ?? "");
      setCardType(found.cardType ?? "");

      lastSuccessfulSerial.current = normalized;

      const missing: string[] = [];

      if (!found.prismNo) missing.push("Prism number");
      if (!found.brand) missing.push("brand");
      if (!found.model) missing.push("model");
      if (!found.capacity) missing.push("storage");
      if (!found.cardType) missing.push("card colour");
      if (!found.price) missing.push("price");

      setNote(
        missing.length
          ? `Asset found. Missing details: ${missing.join(
              ", "
            )}. You can enter them manually.`
          : "All card details loaded. Select the home hub and click Add item."
      );
    } catch {
      if (currentRequest !== requestId.current) return;

      lastSuccessfulSerial.current = "";
      clearDetails();

      setNote(
        "Could not load the asset sheet. Retry with Fetch details or enter the details manually."
      );
    } finally {
      if (currentRequest === requestId.current) {
        activeLookupSerial.current = "";
        setLookingUp(false);
      }
    }
  }

  return (
    <form
      action={addItem}
      aria-label="Add inventory item"
      onSubmit={(event) => {
        // Do not save incomplete details while a lookup is queued
        // or running, including submissions triggered by a keyboard.
        if (
          lookupTimer.current !== null ||
          activeLookupSerial.current ||
          lookupBusy
        ) {
          event.preventDefault();
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <label style={fieldStyle}>
          <span>Serial / Asset Tag *</span>

          <input
            name="itemId"
            placeholder="Scan or type — details load automatically"
            value={serial}
            onChange={(event) =>
              changeSerial(event.target.value)
            }
            onBlur={(event) => {
              // Leaving the field fetches immediately.
              if (event.currentTarget.value.trim()) {
                void lookup(event.currentTarget.value);
              }
            }}
            onKeyDown={(event) => {
              // Scanners commonly send Enter after the Asset Tag.
              if (event.key === "Enter") {
                event.preventDefault();
                void lookup(event.currentTarget.value);
              }
            }}
            autoComplete="off"
            spellCheck={false}
            required
            style={inputStyle}
          />
        </label>

        {/* Home hub is selected manually, not returned by lookup. */}
        <label style={fieldStyle}>
          <span>Home hub *</span>

          <select
            name="homeHub"
            defaultValue=""
            required
            style={inputStyle}
          >
            <option value="" disabled>
              Select home hub
            </option>

            {hubs.map((hub) => (
              <option key={hub.hub_id} value={hub.hub_id}>
                {hub.name}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Prism number</span>

          <input
            name="prismNo"
            placeholder="Prism number"
            value={prismNo}
            onChange={(event) =>
              setPrismNo(event.target.value)
            }
            readOnly={lookupBusy}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>Brand</span>

          <input
            name="brand"
            placeholder="Brand"
            value={brand}
            onChange={(event) =>
              setBrand(event.target.value)
            }
            readOnly={lookupBusy}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>Model</span>

          <input
            name="model"
            placeholder="Model"
            value={model}
            onChange={(event) =>
              setModel(event.target.value)
            }
            readOnly={lookupBusy}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>Storage of card</span>

          <select
            name="capacity"
            value={capacity}
            onChange={(event) =>
              setCapacity(event.target.value)
            }
            disabled={lookupBusy}
            style={inputStyle}
          >
            <option value="">Select storage</option>
            <option value="256 GB">256 GB</option>
            <option value="512 GB">512 GB</option>
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Type of card / colour</span>

          <select
            name="cardType"
            value={cardType}
            onChange={(event) =>
              setCardType(event.target.value)
            }
            disabled={lookupBusy}
            style={inputStyle}
          >
            <option value="">Select card type</option>
            <option value="Black">Black</option>
            <option value="Green">Green</option>
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Price / source penalty (₹)</span>

          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="Enter amount"
            inputMode="decimal"
            value={price}
            onChange={(event) =>
              setPrice(event.target.value)
            }
            readOnly={lookupBusy}
            style={inputStyle}
          />
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        {/* Optional manual retry; automatic lookup works without it. */}
        <button
          type="button"
          disabled={lookingUp || !serial.trim()}
          onClick={() => {
            void lookup(serial, true);
          }}
        >
          {lookingUp ? "Fetching…" : "Fetch details"}
        </button>

        <AddButton lookupBusy={lookupBusy} />
      </div>

      <p
        className={styles.muted}
        role="status"
        aria-live="polite"
        style={{ margin: 0 }}
      >
        {lookingUp
          ? "Looking up card details…"
          : waitingToLookup
            ? "Waiting for typing or scanning to finish…"
            : note ||
              "Enter an Asset Tag. Card details will load automatically; review them before saving."}
      </p>
    </form>
  );
}
