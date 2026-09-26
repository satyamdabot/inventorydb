"use client";

import { useState } from "react";
import styles from "../form.module.css";

export interface PersonGroup {
  role: string;
  label: string;
  people: { id: string; label: string; hub: string }[];
}

/**
 * "Send to": the person AND the location, both required. The person is picked in two steps (category,
 * then a person from it) so the list stays short. Once a person is chosen the location fills in with
 * their own hub, and stays changeable for someone who is working somewhere else.
 */
export default function SendToFields({
  groups,
  hubs,
}: {
  groups: PersonGroup[];
  hubs: { id: string; name: string }[];
}) {
  const [role, setRole] = useState("");
  const [person, setPerson] = useState("");
  const [hub, setHub] = useState("");
  const [hubChosenByHand, setHubChosenByHand] = useState(false);
  const people = groups.find((g) => g.role === role)?.people ?? [];

  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="recipient">
          Send to (person)
        </label>
        <div className={styles.control}>
          <div className={styles.pair}>
            <select
              aria-label="Category"
              value={role}
              required
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
              required
              disabled={!role}
              onChange={(e) => {
                setPerson(e.target.value);
                const chosen = people.find((p) => p.id === e.target.value);
                if (chosen && !hubChosenByHand) setHub(chosen.hub);
              }}
            >
              <option value="">{role ? "Select a person" : "Choose a category first"}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <p className={styles.hint}>
            IM: waits to be received. IFO: traveling. FO: with the field officer. Rig: with the rig team.
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="hub">
          Send to (location)
        </label>
        <div className={styles.control}>
          <select
            id="hub"
            name="hub"
            value={hub}
            required
            onChange={(e) => {
              setHub(e.target.value);
              setHubChosenByHand(true);
            }}
          >
            <option value="">Select a location</option>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <p className={styles.hint}>
            Where the cards will be recorded. It fills in with the person&apos;s own hub. Change it if they are working
            somewhere else.
          </p>
        </div>
      </div>
    </>
  );
}
