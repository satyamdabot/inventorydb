"use client";

import { useRef } from "react";
import type { Hub } from "@/lib/schema";
import styles from "../admin.module.css";
import { saveHub } from "./actions";

/** Every field applies immediately: text fields on blur (if changed), selects and checkboxes on change. No Save button. */
export default function HubRow({ hub, parentOptions }: { hub: Hub; parentOptions: { hub_id: string; name: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} action={saveHub} className={styles.row}>
      <input type="hidden" name="hub_id" value={hub.hub_id} />
      <input name="name" defaultValue={hub.name} required onBlur={(e) => e.target.value !== hub.name && submit()} />
      <input name="city" defaultValue={hub.city} onBlur={(e) => e.target.value !== hub.city && submit()} />
      <select name="parent" defaultValue={hub.parent_hub} aria-label="Parent hub" onChange={submit}>
        <option value="">Parent: none (top level)</option>
        {parentOptions.map((c) => (
          <option key={c.hub_id} value={c.hub_id}>
            Under: {c.name}
          </option>
        ))}
      </select>
      <label>
        <input type="checkbox" name="is_central" defaultChecked={hub.is_central === "true"} onChange={submit} /> Central
      </label>
      <label>
        <input type="checkbox" name="active" defaultChecked={hub.active !== "false"} onChange={submit} /> Active
      </label>
    </form>
  );
}
