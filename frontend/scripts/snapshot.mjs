import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = "0x26d11ddA633434BF879876bd120f2052765b73fB";
const MARKET = "0x21e6160A6B5166A60B58B5E06C4375d254C81DF8";
const GAP_MS = 2200;
const RETRY_WAIT_MS = 6000;

const MANDATE_KEYS = [
  "id", "parent_id", "root_id", "depth", "grantor", "grantee", "text", "text_hash",
  "cap", "expiry", "categories", "vendors", "status", "path", "reasoning",
  "minority_note", "violated_restriction", "escalated", "created_at", "verdict",
  "escalation_verdict", "escalation_reasoning", "escalation_minority_note", "escalated_by",
];

const CAPABILITY_KEYS = [
  "id", "status", "grantee", "item_id", "price", "mandate_id", "vendor", "category",
  "path", "verdict", "reasoning", "minority_note", "violated_restriction", "escalated",
  "escalation_verdict", "escalation_reasoning", "escalation_minority_note", "escalated_by", "created_at",
];

const ITEM_KEYS = ["id", "vendor", "category", "title", "description", "price"];

const PURCHASE_KEYS = ["capability", "buyer", "vendor", "item", "price", "root", "at"];

const client = createClient({ chain: studionet });

let lastStart = 0;

async function read(address, fn, args = []) {
  const gap = GAP_MS - (Date.now() - lastStart);
  if (gap > 0) {
    await new Promise((r) => setTimeout(r, gap));
  }
  lastStart = Date.now();
  try {
    return await client.readContract({ address, functionName: fn, args });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (!text.includes("Rate limit")) {
      throw err;
    }
    console.log("  rate limited on " + fn + ", waiting 6s and retrying once");
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    lastStart = Date.now();
    return await client.readContract({ address, functionName: fn, args });
  }
}

function toStr(v) {
  if (v === undefined || v === null) return "";
  return String(v);
}

function toNumber(v) {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error("unsafe integer " + v);
    return v;
  }
  if (typeof v === "bigint") {
    const n = Number(v);
    if (!Number.isSafeInteger(n)) throw new Error("unsafe integer " + v.toString());
    return n;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("not a number: " + JSON.stringify(v));
  if (!Number.isSafeInteger(n)) throw new Error("unsafe integer " + n);
  return n;
}

function toRecord(raw, keys) {
  const src =
    raw instanceof Map
      ? Object.fromEntries(raw.entries())
      : raw && typeof raw === "object"
        ? raw
        : {};
  const out = {};
  for (const k of keys) out[k] = toStr(src[k]);
  return out;
}

const epochNow = Math.floor(Date.now() / 1000);
const started = Date.now();

const mandateCount = toNumber(await read(REGISTRY, "get_mandate_count"));
console.log("mandate_count =", mandateCount);

const mandatesRaw = [];
for (let i = 0; i < mandateCount; i++) {
  const id = `m_${i}`;
  const m = toRecord(await read(REGISTRY, "get_mandate", [id]), MANDATE_KEYS);
  m.expiry = toNumber(m.expiry === "" ? 0 : Number(m.expiry)) + "";
  m.cap = toNumber(m.cap === "" ? 0 : Number(m.cap)) + "";
  m.depth = toNumber(m.depth === "" ? 0 : Number(m.depth)) + "";
  m.created_at = toNumber(m.created_at === "" ? 0 : Number(m.created_at)) + "";
  mandatesRaw.push(m);
  console.log("mandate " + id + " status=" + m.status + " path=" + m.path + " root=" + m.root_id);
}

const itemCount = toNumber(await read(REGISTRY, "get_item_count"));
console.log("item_count =", itemCount);
const itemsRaw = [];
for (let i = 0; i < itemCount; i++) {
  const id = `item_${i}`;
  const it = toRecord(await read(REGISTRY, "get_item", [id]), ITEM_KEYS);
  it.price = toNumber(it.price === "" ? 0 : Number(it.price)) + "";
  itemsRaw.push(it);
  console.log("item " + id + " " + it.title + " (" + it.price + " GEN)");
}

const capabilityCount = toNumber(await read(REGISTRY, "get_capability_count"));
console.log("capability_count =", capabilityCount);
const capsRaw = [];
for (let i = 0; i < capabilityCount; i++) {
  const id = `c_${i}`;
  const c = toRecord(await read(REGISTRY, "get_capability", [id]), CAPABILITY_KEYS);
  c.price = toNumber(c.price === "" ? 0 : Number(c.price)) + "";
  capsRaw.push(c);
  console.log("capability " + id + " status=" + c.status + " mandate=" + c.mandate_id);
}

const vendorAddrs = [
  ...new Set(itemsRaw.map((it) => toStr(it.vendor).toLowerCase()).filter((a) => a !== "")),
];
const vendorNames = {};
for (const addr of vendorAddrs) {
  const name = toStr(await read(REGISTRY, "get_vendor", [addr]));
  if (name !== "") vendorNames[addr] = name;
  console.log("vendor " + addr + " -> " + (name === "" ? "(unknown)" : '"' + name + '"'));
}

const byId = {};
for (const m of mandatesRaw) byId[m.id] = m;

const finalMandateIds = new Set();
for (const m of mandatesRaw) {
  const root = byId[m.root_id];
  if (!root) continue;
  if (root.status === "REVOKED") {
    finalMandateIds.add(m.id);
    continue;
  }
  const expiry = Number(root.expiry);
  if (Number.isFinite(expiry) && expiry < epochNow) {
    finalMandateIds.add(m.id);
  }
}
const finalCapabilityIds = new Set();
for (const c of capsRaw) {
  if (finalMandateIds.has(c.mandate_id)) finalCapabilityIds.add(c.id);
}
console.log("FINAL mandates: " + [...finalMandateIds].join(", "));
console.log("FINAL capabilities: " + [...finalCapabilityIds].join(", "));

const spent = {};
for (const id of finalMandateIds) {
  spent[id] = toNumber(await read(MARKET, "get_spent", [id]));
  console.log("spent " + id + " = " + spent[id]);
}

const escrow = {};
for (const root of mandatesRaw) {
  if (root.parent_id !== "") continue;
  if (!finalMandateIds.has(root.id)) continue;
  escrow[root.id] = toNumber(await read(MARKET, "get_escrow", [root.id]));
  console.log("escrow " + root.id + " = " + escrow[root.id]);
}

const purchases = {};
const purchaseRecords = {};
for (const c of capsRaw) {
  if (!finalCapabilityIds.has(c.id)) continue;
  const purId = toStr(await read(MARKET, "get_purchase_for_capability", [c.id]));
  console.log("purchase_for_capability " + c.id + " -> " + (purId === "" ? "(none)" : purId));
  if (purId === "") continue;
  purchases[c.id] = purId;
  purchaseRecords[purId] = toRecord(await read(MARKET, "get_purchase", [purId]), PURCHASE_KEYS);
}

const totalMinted = toNumber(await read(MARKET, "get_total_minted"));
console.log("total_minted =", totalMinted, "(read only, not stored)");
const vaultBalance = toNumber(await read(MARKET, "get_vault_balance"));
console.log("vault_balance =", vaultBalance, "(read only, not stored)");

const snapshot = {
  takenAt: new Date().toISOString(),
  counts: { mandates: mandateCount, items: itemCount, capabilities: capabilityCount },
  mandates: mandatesRaw.filter((m) => finalMandateIds.has(m.id)),
  items: itemsRaw,
  capabilities: capsRaw.filter((c) => finalCapabilityIds.has(c.id)),
  vendorNames,
  spent,
  escrow,
  purchases,
  purchaseRecords,
};

const target = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "snapshot.json");
if (!existsSync(dirname(target))) {
  mkdirSync(dirname(target), { recursive: true });
}
writeFileSync(target, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

const seconds = Math.round((Date.now() - started) / 1000);
console.log("");
console.log("snapshot written to src/data/snapshot.json");
console.log(
  "counts: " +
    mandateCount +
    " mandates, " +
    itemCount +
    " items, " +
    capabilityCount +
    " capabilities"
);
console.log("FINAL mandates: " + [...finalMandateIds].join(", "));
console.log("FINAL capabilities: " + [...finalCapabilityIds].join(", "));
console.log("purchases captured: " + Object.keys(purchases).join(", "));
console.log("took " + seconds + " seconds");
