import type { Person } from "./schema";

export type LoginRole = "admin" | "im" | "rig";

// The person role a login role must be linked to. An admin login may be linked to anyone, or no one.
const NEEDS: Partial<Record<LoginRole, Person["role"]>> = { im: "im", rig: "rig" };

/**
 * Checks the person a login is linked to. An IM login must link to an active IM and a Rig login to an
 * active rig team member, so a login's name and hub always come from the right kind of person.
 * Returns the person_id to store ("" for an unlinked admin), or undefined if the link is not allowed.
 */
export function checkUserLink(role: LoginRole, personId: string, people: Person[]): string | undefined {
  const need = NEEDS[role];
  if (!personId) return need ? undefined : "";
  const person = people.find((p) => p.person_id === personId && p.active !== "false");
  if (!person) return undefined;
  return need && person.role !== need ? undefined : personId;
}
