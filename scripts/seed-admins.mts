import { getStore } from "../src/lib/store";

// Adds the first admins to the `users` tab. Safe to run again.
const ADMINS = ["sraj@ailabs.instawork.com", "ayadav@instawork.com"];

process.env.STORE = "sheets";
await getStore().upsert(
  "users",
  ADMINS.map((email) => ({ email, role: "admin", person_id: "" })),
);
console.log(`Admins ready: ${ADMINS.join(", ")}`);
