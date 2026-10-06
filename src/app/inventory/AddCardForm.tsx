"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "../admin/admin.module.css";
import { addItem, lookupAsset } from "./actions";

type Hubs = {
  hub_id: string;
  name: string;
}[];

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

  function clearDetails() {
    setPrismNo("");
    setBrand("");
    setModel("");
    setPrice("");
    setCapacity("");
    setCardType("");
  }

  function changeSerial(value: string) {
    // Invalidate any lookup still running for the previous serial.
    requestId.current += 1;
    lastSuccessfulSerial.current = "";

    setSerial(value);
    setLookingUp(false);
    setNote("");
    clearDetails();
  }

  async function lookup(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    const normalized = trimmed.toLowerCase();

    // Do not overwrite manual edits when leaving the same serial again.
    if (lastSuccessfulSerial.current === normalized) return;

    const currentRequest = ++requestId.current;
    setLookingUp(true);
    setNote("");

    try {
      const found = await lookupAsset(trimmed);

      // Ignore a response if the serial changed while it was loading.
      if (currentRequest !== requestId.current) return;

      if (!found) {
        clearDetails();
        setNote(
          "No asset-sheet match found. Enter the card details manually."
        );
        return;
      }

      setPrismNo(found.prismNo);
      setBrand(found.brand);
      setModel(found.model);
      setPrice(found.price);
      setCapacity(found.capacity);
      setCardType(found.cardType);

      lastSuccessfulSerial.current = normalized;

      const missing: string[] = [];
      if (!found.capacity) missing.push("capacity");
      if (!found.cardType) missing.push("card type");
      if (!found.price) missing.push("price");

      setNote(
        missing.length
          ? `Asset found. Please fill in missing ${missing.join(", ")}.`
          : "Asset found. Capacity, card type and price loaded."
      );
    } catch {
      if (currentRequest !== requestId.current) return;

      clearDetails();
      setNote(
        "Asset lookup failed. Check the sheet connection or enter details manually."
      );
    } finally {
      if (currentRequest === requestId.current) {
        setLookingUp(false);
      }
    }
  }

  return (
    <form action={addItem} className={styles.row}>
      <input
        name="itemId"
        placeholder="Serial / Asset Tag"
        aria-label="Serial or Asset Tag"
        value={serial}
        onChange={(e) => changeSerial(e.target.value)}
        onBlur={(e) => {
          void lookup(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void lookup(e.currentTarget.value);
          }
        }}
        required
        autoComplete="off"
      />

      <select
        name="homeHub"
        defaultValue=""
        required
        aria-label="Home hub"
      >
        <option value="" disabled>
          Home hub
        </option>

        {hubs.map((hub) => (
          <option key={hub.hub_id} value={hub.hub_id}>
            {hub.name}
          </option>
        ))}
      </select>

      <input
        name="prismNo"
        placeholder="Prism no."
        aria-label="Prism number"
        value={prismNo}
        onChange={(e) => setPrismNo(e.target.value)}
        readOnly={lookingUp}
      />

      <input
        name="brand"
        placeholder="Brand"
        aria-label="Brand"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        readOnly={lookingUp}
      />

      <input
        name="model"
        placeholder="Model"
        aria-label="Model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        readOnly={lookingUp}
      />

      <select
        name="capacity"
        aria-label="Capacity"
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        disabled={lookingUp}
      >
        <option value="">Select capacity</option>
        <option value="256 GB">256 GB</option>
        <option value="512 GB">512 GB</option>
      </select>

      <select
        name="cardType"
        aria-label="Card type or colour"
        value={cardType}
        onChange={(e) => setCardType(e.target.value)}
        disabled={lookingUp}
      >
        <option value="">Select card type</option>
        <option value="Black">Black</option>
        <option value="Green">Green</option>
      </select>

      <input
        name="price"
        type="number"
        min="0"
        step="0.01"
        placeholder="Price / source penalty (₹)"
        aria-label="Price in rupees"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        readOnly={lookingUp}
      />

      <AddButton lookingUp={lookingUp} />

      <span className={styles.muted} role="status" aria-live="polite">
        {lookingUp ? "Looking up…" : note}
      </span>
    </form>
  );
}