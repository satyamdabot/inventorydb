"use client";

import { useRef } from "react";
import type { Hub, Person } from "@/lib/schema";
import styles from "../admin.module.css";
import { savePerson } from "./actions";

const ROLE_LABELS = { im: "IM", ifo: "IFO", fo: "FO", rig: "Rig team" } as const;

/** Every field applies immediately: text fields on blur (if changed), selects and checkboxes on change. No Save button. */
export default function PersonRow({ person, hubs }: { person: Person; hubs: Hub[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} action={savePerson} className={styles.row}>
      <input type="hidden" name="person_id" value={person.person_id} />
      <input name="name" defaultValue={person.name} required onBlur={(e) => e.target.value !== person.name && submit()} />
      <select name="role" defaultValue={person.role} onChange={submit}>
        {Object.entries(ROLE_LABELS).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <select name="hub" defaultValue={person.hub} onChange={submit}>
        {hubs.map((h) => (
          <option key={h.hub_id} value={h.hub_id}>
            {h.name}
          </option>
        ))}
      </select>
      <input
        name="email"
        type="email"
        defaultValue={person.linked_user}
        onBlur={(e) => e.target.value !== person.linked_user && submit()}
      />
      <label>
        <input type="checkbox" name="active" defaultChecked={person.active !== "false"} onChange={submit} /> Active
      </label>
    </form>
  );
}
