"use client";

import { useState } from "react";
import styles from "../form.module.css";

export interface PersonGroup {
  role: string;
  label: string;
  people: { id: string; label: string }[];
}

/**
 * Two lists instead of one long one: pick a category (IM, IFO, FO, rig team), then a person from
 * that category. Only the person list is submitted, as `recipient`.
 */
export default function PersonPicker({ groups }: { groups: PersonGroup[] }) {
  const [role, setRole] = useState("");
  const [person, setPerson] = useState("");
  const people = groups.find((g) => g.role === role)?.people ?? [];

  return (
    <div className={styles.pair}>
      <select
        aria-label="Category"
        value={role}
        onChange={(e) => {
          setRole(e.target.value);
          setPerson(""); // a person from the old category must not stay selected
        }}
      >
        <option value="">Select a category</option>
        {groups.map((g) => (
          <option key={g.role} value={g.role}>
            {g.label} ({g.people.length})
          </option>
        ))}
      </select>
      <select
        id="recipient"
        name="recipient"
        aria-label="Person"
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        disabled={!role}
      >
        <option value="">{role ? "Select a person" : "Choose a category first"}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
