import type { Role, Status } from "./schema";

export const STATUS_LABELS: Record<Status, string> = {
  in_stock: "In stock",
  pending: "Pending receipt",
  traveling: "Traveling (IFO)",
  with_fo: "With FO",
  with_rig: "With rig team",
  lost: "Lost",
  damaged: "Damaged",
  retired: "Retired",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  im: "IM",
  ifo: "IFO",
  fo: "FO",
  rig: "Rig team",
};

/** First value of a search param, which Next may give as string, array or undefined. */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
