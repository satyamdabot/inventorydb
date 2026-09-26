"use client";

/** The "Receiving at" list. Choosing a hub reloads the page for that hub straight away, with no button to press. */
export default function HubSelect({
  hubs,
  value,
}: {
  hubs: { id: string; name: string }[];
  value: string;
}) {
  return (
    <select
      name="hub"
      defaultValue={value}
      aria-label="Receiving at"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {hubs.map((h) => (
        <option key={h.id} value={h.id}>
          Receiving at: {h.name}
        </option>
      ))}
    </select>
  );
}
