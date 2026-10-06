"use client";

import { useRef, useState, type CSSProperties } from "react";
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

function AddButton({ lookingUp }: { lookingUp: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={lookingUp || pending}>
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

  const requestId = useRef(0);
  const lastSuccessfulSerial = useRef("");
  const activeLookupSerial = useRef("");

  function clearDetails() {
    setPrismNo("");
    setBrand("");
    setModel("");
    setPrice("");
    setCapacity("");
    setCardType("");
  }

  function changeSerial(value: string) {
    // Prevent an old lookup response from filling a different card.
    requestId.current += 1;
    lastSuccessfulSerial.current = "";
    activeLookupSerial.current = "";

    setSerial(value);
    setLookingUp(false);
    setNote("");
    clearDetails();
  }

  async function lookup(value: string, force = false) {
    const trimmed = value.trim();

    if (!trimmed) {
      setNote("Enter or scan an Asset Tag first.");
      return;
    }

    const normalized = trimmed.toLowerCase();

    // Avoid duplicate requests for the same serial.
    if (activeLookupSerial.current === normalized) return;

    // Automatic lookup should not overwrite manually edited fields.
    // The Fetch details button can explicitly fetch them again.
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
          "No matching Asset Tag was found. You can enter the details manually."
        );
        return;
      }

      setPrismNo(found.prismNo ?? "");
      setBrand(found.brand ?? "");
      setModel(found.model ?? "");
      setPrice(found.price ?? "");
      setCapacity(found.capacity ?? "");
      setCardType(found.cardType ?? "");

      lastSuccessfulSerial.current = normalized;

      const missing: string[] = [];

      if (!found.capacity) missing.push("storage");
      if (!found.cardType) missing.push("card type");
      if (!found.price) missing.push("price");

      setNote(
        missing.length
          ? `Asset found. Missing in lookup: ${missing.join(
              ", "
            )}. Select or enter these fields manually.`
          : "Asset found. Storage, card type and price loaded."
      );
    } catch {
      if (currentRequest !== requestId.current) return;

      lastSuccessfulSerial.current = "";
      clearDetails();

      setNote(
        "Could not load the asset sheet. Check its connection or enter the details manually."
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
        // Also block keyboard submission during a lookup.
        if (activeLookupSerial.current) {
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
            placeholder="Scan or type Asset Tag"
            value={serial}
            onChange={(event) =>
              changeSerial(event.target.value)
            }
            onBlur={(event) => {
              if (event.currentTarget.value.trim()) {
                void lookup(event.currentTarget.value);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void lookup(event.currentTarget.value);
              }
            }}
            autoComplete="off"
            required
            style={inputStyle}
          />
        </label>

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
            readOnly={lookingUp}
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
            readOnly={lookingUp}
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
            readOnly={lookingUp}
            style={inputStyle}
          />
        </label>

        {/* STORAGE OF CARD */}
        <label style={fieldStyle}>
          <span>Storage of card</span>

          <select
            name="capacity"
            value={capacity}
            onChange={(event) =>
              setCapacity(event.target.value)
            }
            disabled={lookingUp}
            style={inputStyle}
          >
            <option value="">Select storage</option>
            <option value="256 GB">256 GB</option>
            <option value="512 GB">512 GB</option>
          </select>
        </label>

        {/* TYPE / COLOUR OF CARD */}
        <label style={fieldStyle}>
          <span>Type of card / colour</span>

          <select
            name="cardType"
            value={cardType}
            onChange={(event) =>
              setCardType(event.target.value)
            }
            disabled={lookingUp}
            style={inputStyle}
          >
            <option value="">Select card type</option>
            <option value="Black">Black</option>
            <option value="Green">Green</option>
          </select>
        </label>

        {/* PRICE */}
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
            readOnly={lookingUp}
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
        <button
          type="button"
          disabled={lookingUp || !serial.trim()}
          onClick={() => {
            void lookup(serial, true);
          }}
        >
          {lookingUp ? "Fetching…" : "Fetch details"}
        </button>

        <AddButton lookingUp={lookingUp} />
      </div>

      <p
        className={styles.muted}
        role="status"
        aria-live="polite"
        style={{ margin: 0 }}
      >
        {lookingUp
          ? "Looking up card details…"
          : note ||
            "Scan an Asset Tag or click Fetch details. You can edit the returned details before saving."}
      </p>
    </form>
  );
}