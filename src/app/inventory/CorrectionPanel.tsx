import { ROLE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { STATUSES, type Hub, type Person } from "@/lib/schema";
import styles from "../admin/admin.module.css";

// Form fields for correcting cards. The parent page supplies the <form> and the card ids.
export default function CorrectionPanel({
  hubs,
  people,
  showScan,
}: {
  hubs: Hub[];
  people: Person[];
  showScan: boolean;
}) {
  const activeHubs = hubs.filter((h) => h.active !== "false").sort((a, b) => a.name.localeCompare(b.name));
  const activePeople = people.filter((p) => p.active !== "false").sort((a, b) => a.name.localeCompare(b.name));

  return (
    <fieldset className={styles.details}>
      <legend>Correct status / location</legend>
      <p className={styles.muted}>
        Sets where the selected cards really are. It is recorded as a correction with your name and the
        note. Holder is used for Pending, Traveling, With FO and With rig team only.
      </p>
      {showScan && (
        <textarea
          name="scanned"
          rows={3}
          placeholder="Or scan / paste serials here, one per line"
          className={styles.textarea}
        />
      )}
      <div className={styles.row}>
        <select name="status" defaultValue="" required>
          <option value="" disabled>
            New status
          </option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="hub" defaultValue="">
          <option value="">Current hub: keep</option>
          {activeHubs.map((h) => (
            <option key={h.hub_id} value={h.hub_id}>
              {h.name}
            </option>
          ))}
        </select>
        <select name="holder" defaultValue="">
          <option value="">Holder: none</option>
          {activePeople.map((p) => (
            <option key={p.person_id} value={p.person_id}>
              {p.name} ({ROLE_LABELS[p.role]})
            </option>
          ))}
        </select>
        <select name="homeHub" defaultValue="">
          <option value="">Home hub: keep</option>
          {activeHubs.map((h) => (
            <option key={h.hub_id} value={h.hub_id}>
              Home: {h.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <input name="note" placeholder="Note (required), e.g. found with FO in Kadapa" required />
        <button type="submit">Apply correction</button>
      </div>
    </fieldset>
  );
}
