"use client";

import { useFormStatus } from "react-dom";
import type { Hub, Person } from "@/lib/schema";
import styles from "../admin.module.css";
import { savePerson } from "./actions";

const ROLE_LABELS = {
  im: "IM",
  ifo: "IFO",
  fo: "FO",
  rig: "Rig team",
} as const;

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export default function PersonRow({
  person,
  hubs,
}: {
  person: Person;
  hubs: Hub[];
}) {
  const hubPresent = hubs.some(
    (hub) => hub.hub_id === person.hub
  );

  const rolePresent = Object.prototype.hasOwnProperty.call(
    ROLE_LABELS,
    person.role
  );

  return (
    <form
      action={savePerson}
      className={styles.row}
      aria-label={`Edit ${person.name}`}
      style={{ flexWrap: "wrap", gap: 10 }}
    >
      {/* Keep the same ID so historical events remain linked. */}
      <input
        type="hidden"
        name="person_id"
        value={person.person_id}
      />

      <input
        name="name"
        defaultValue={person.name}
        placeholder="Full name"
        aria-label={`Name for ${person.name}`}
        maxLength={80}
        required
      />

      <select
        name="role"
        defaultValue={person.role}
        aria-label={`Role for ${person.name}`}
        required
      >
        {!rolePresent && (
          <option value="" >
            Select a supported role
          </option>
        )}

        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        name="hub"
        defaultValue={person.hub}
        aria-label={`Hub for ${person.name}`}
        required
      >
        {!hubPresent && (
          <option value={person.hub}>
            {person.hub || "Select a hub"} — unavailable
          </option>
        )}

        {hubs.map((hub) => (
          <option key={hub.hub_id} value={hub.hub_id}>
            {hub.name}
            {hub.active === "false" ? " (inactive)" : ""}
          </option>
        ))}
      </select>

      <input
        name="email"
        type="email"
        defaultValue={person.linked_user ?? ""}
        placeholder="Email (required)"
        aria-label={`Email for ${person.name}`}
        required
        style={{ minWidth: 220 }}
      />

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <input
          type="checkbox"
          name="active"
          defaultChecked={person.active !== "false"}
        />
        Active
      </label>

      <SaveButton />
    </form>
  );
}