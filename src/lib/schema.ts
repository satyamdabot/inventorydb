// Sheet tabs and their columns. The first column of each tab is its key.
// Adding a column here and running `npm run init:sheet` extends the sheet header.

export const TABS = {
  items: [
    "item_id",
    "item_type",
    "home_hub",
    "current_hub",
    "status",
    "current_holder",
    "last_event_id",
    "updated_at",
    "attributes", // JSON of type-specific fields (serial, brand, model, ...)
    "prism_no",
    "brand",
    "model", // SD card model name
  ],
  events: [
    "event_id",
    "batch_id",
    "item_id",
    "action",
    "from_person",
    "to_person",
    "hub",
    "status_after",
    "occurred_at",
    "recorded_at",
    "recorded_by",
    "note",
    "from_id", // person_id (or admin email) behind from_person, stays stable if a name changes
    "to_id",
  ],
  people: ["person_id", "name", "role", "hub", "linked_user", "active"],
  hubs: ["hub_id", "name", "city", "is_central", "active"],
  item_types: ["type", "fields"],
  users: ["email", "role", "person_id", "active"],
  status_limits: ["status", "max_days"],
} as const;

export type TabName = keyof typeof TABS;

export const STATUSES = [
  "in_stock",
  "pending",
  "traveling",
  "with_fo",
  "with_rig",
  "lost",
  "damaged",
  "retired",
] as const;
export type Status = (typeof STATUSES)[number];

// Statuses where a card is out of an IM's hands and someone is expected to bring it back.
export const OUT_STATUSES: readonly Status[] = ["pending", "traveling", "with_fo", "with_rig"];

export const ACTIONS = [
  "check_out",
  "check_in",
  "receive",
  "report_lost",
  "report_damaged",
  "retire",
  "reassign_home_hub",
  "correct",
  "import",
] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLES = ["admin", "im", "ifo", "fo", "rig"] as const;
export type Role = (typeof ROLES)[number];

export type Row = Record<string, string>;

export interface Item extends Row {
  item_id: string;
  item_type: string;
  home_hub: string;
  current_hub: string;
  status: Status;
  current_holder: string;
  last_event_id: string;
  updated_at: string;
  attributes: string;
  prism_no: string;
  brand: string;
  model: string;
}

export interface ItemEvent extends Row {
  event_id: string;
  batch_id: string;
  item_id: string;
  action: Action;
  from_person: string;
  to_person: string;
  hub: string;
  status_after: Status;
  occurred_at: string;
  recorded_at: string;
  recorded_by: string;
  note: string;
  from_id: string;
  to_id: string;
}

export interface Person extends Row {
  person_id: string;
  name: string;
  role: Role;
  hub: string;
  linked_user: string;
  active: string;
}

export interface Hub extends Row {
  hub_id: string;
  name: string;
  city: string;
  is_central: string;
  active: string;
}

export interface AppUser extends Row {
  email: string;
  role: Role;
  person_id: string;
  active: string; // blank counts as active
}

export interface TabRows {
  items: Item;
  events: ItemEvent;
  people: Person;
  hubs: Hub;
  item_types: Row;
  users: AppUser;
  status_limits: Row;
}
