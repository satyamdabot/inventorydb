import assert from "node:assert/strict";
import { cleanPrice, findAsset, parseAssetRow } from "../src/lib/asset-lookup";

// A real row from the customer's sheet: Asset Tag, SD Card Serial No, Storage, Country, Brand, Model, Prism No., Penalty, Status.
const row = ["SD-5425Y1DLQ011", "SD-5425Y1DLQ011", "512 GB", "Malaysia", "SanDisk", "SanDisk Extreme A2 V30", "B584-4E36", "₹20,000.00", "Ready for Check-Out"];
const parsed = parseAssetRow(row);
assert.equal(parsed!.itemId, "SD-5425Y1DLQ011");
assert.equal(parsed!.brand, "SanDisk");
assert.equal(parsed!.model, "SanDisk Extreme A2 V30");
assert.equal(parsed!.prismNo, "B584-4E36");
assert.equal(parsed!.price, "20000.00");

// A blank Asset Tag means no usable row.
assert.equal(parseAssetRow(["", "x", "512 GB"]), null);
assert.equal(parseAssetRow([]), null);

// Currency symbol and thousands separators are stripped; plain numbers pass through unchanged.
assert.equal(cleanPrice("₹20,000.00"), "20000.00");
assert.equal(cleanPrice("7500"), "7500");
assert.equal(cleanPrice(""), "");

// Matching is case-insensitive, like scanning everywhere else in the app.
const records = [parsed!];
assert.equal(findAsset(records, "sd-5425y1dlq011")!.brand, "SanDisk");
assert.equal(findAsset(records, "  SD-5425Y1DLQ011  ")!.brand, "SanDisk");
assert.equal(findAsset(records, "SD-9999"), undefined);
assert.equal(findAsset(records, ""), undefined);

console.log("asset-lookup tests passed");
