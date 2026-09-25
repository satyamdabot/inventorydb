import { getStore } from "../src/lib/store";

// Creates the tabs and header rows in the Google Sheet. Safe to run again.
process.env.STORE = "sheets";
await getStore().init();
console.log("Sheet tabs and headers are ready.");
