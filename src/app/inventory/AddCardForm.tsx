"use client";

import { useState, useTransition } from "react";
import styles from "../admin/admin.module.css";
import { addItem, lookupAsset } from "./actions";

/**
 * Scan or type the serial, and we try to fill brand, model, prism no. and price from the customer's
 * asset sheet (by Asset Tag). Nothing is locked: every field stays editable before Add card is pressed.
 * Enter (as a barcode scanner sends it) triggers the lookup instead of submitting the form.
 */
export default function AddCardForm({ hubs }: { hubs: { hub_id: string; name: string }[] }) {
  const [prismNo, setPrismNo] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function lookup(serial: string) {
    const s = serial.trim();
    if (!s) return;
    startTransition(async () => {
      const found = await lookupAsset(s);
      if (found) {
        setBrand(found.brand);
        setModel(found.model);
        setPrismNo(found.prismNo);
        setPrice(found.price);
        setNote(`Found in the asset sheet: ${found.brand} ${found.model}.`);
      } else {
        setNote("Not in the asset sheet — fill in the details below.");
      }
    });
  }

  return (
    <form action={addItem} className={styles.row}>
      <input
        name="itemId"
        placeholder="Serial (scan or type)"
        required
        autoComplete="off"
        onBlur={(e) => lookup(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            lookup(e.currentTarget.value);
          }
        }}
      />
      <select name="homeHub" defaultValue="" required aria-label="Home hub">
        <option value="" disabled>
          Home hub
        </option>
        {hubs.map((h) => (
          <option key={h.hub_id} value={h.hub_id}>
            {h.name}
          </option>
        ))}
      </select>
      <input name="prismNo" placeholder="Prism no." value={prismNo} onChange={(e) => setPrismNo(e.target.value)} />
      <input name="brand" placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <input name="model" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
      <input name="price" placeholder="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <button type="submit">Add card</button>
      {pending ? <span className={styles.muted}>Looking up…</span> : note && <span className={styles.muted}>{note}</span>}
    </form>
  );
}
