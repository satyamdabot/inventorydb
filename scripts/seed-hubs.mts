import { slugify } from "../src/lib/slug";
import { getStore } from "../src/lib/store";

// Loads the initial hubs. Safe to run again: hubs that already exist are left untouched.
// Later changes are made in the Admin > Hubs screen.
const HUBS: { name: string; city?: string; central?: boolean }[] = [
  { name: "Bangalore", central: true },
  { name: "Bhopal" },
  { name: "Udaipur" },
  { name: "Gurgaon" },
  { name: "Dhawalgaon" },
  { name: "Garchuk" },
  { name: "Salem" },
  { name: "Nagpur" },
  { name: "Nandyal" },
  { name: "Pungunar" },
  { name: "Rajampet" },
  { name: "Ballari" },
  { name: "Ballari 2", city: "Ballari" },
  { name: "Guntakal" },
  { name: "Hindupur" },
  { name: "Kadapa" },
  { name: "Kadapa-2", city: "Kadapa" },
  { name: "Nellore" },
  { name: "Tirupati" },
  { name: "Hospet" },
  { name: "Tumkuru" },
  { name: "Badvel" },
  { name: "Anantapur" },
  { name: "Guntur" },
  { name: "Coimbatore" },
  { name: "Channapatna" },
  { name: "Hosur" },
  { name: "Hyderabad" },
  { name: "Pavagada" },
  { name: "Humnabad" },
  { name: "Vijayawada" },
  { name: "Mangalore" },
  { name: "Kolhapur" },
  { name: "Gulbarga" },
];

process.env.STORE = "sheets";
const store = getStore();
const existing = new Set((await store.list("hubs")).map((h) => h.hub_id));
const fresh = HUBS.filter((h) => !existing.has(slugify(h.name)));

await store.upsert(
  "hubs",
  fresh.map((h) => ({
    hub_id: slugify(h.name),
    name: h.name,
    city: h.city ?? h.name,
    is_central: h.central ? "true" : "false",
    active: "true",
  })),
);
console.log(`Added ${fresh.length} hubs, skipped ${HUBS.length - fresh.length} that already exist.`);
