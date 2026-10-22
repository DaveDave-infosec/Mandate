import { normalize, readMarket, readRegistry } from "./rpc";
import { PURCHASE_KEYS, purchaseIsOpen, type Capability, type Item, type Mandate, type Purchase } from "./mandate";
import snapshotData from "../data/snapshot.json";

export interface Store {
  mandates: Record<string, Mandate>;
  items: Record<string, Item>;
  capabilities: Record<string, Capability>;
  vendorNames: Record<string, string>;
  spent: Record<string, number>;
  escrow: Record<string, number>;
  purchases: Record<string, string>;
  purchaseRecords: Record<string, Purchase>;
  totalMinted: number | null;
  vaultBalance: number | null;
  heldTotal: number | null;
  final: Set<string>;
}

const MANDATE_KEYS = [
  "id", "parent_id", "root_id", "depth", "grantor", "grantee", "text", "text_hash",
  "cap", "expiry", "categories", "vendors", "status", "path", "reasoning",
  "minority_note", "violated_restriction", "escalated", "created_at", "verdict",
  "escalation_verdict", "escalation_reasoning", "escalation_minority_note", "escalated_by",
] as const;

const CAPABILITY_KEYS = [
  "id", "status", "grantee", "item_id", "price", "mandate_id", "vendor", "category",
  "path", "verdict", "reasoning", "minority_note", "violated_restriction", "escalated",
  "escalation_verdict", "escalation_reasoning", "escalation_minority_note", "escalated_by",
  "created_at",
] as const;

const ITEM_KEYS = ["id", "vendor", "category", "title", "description", "price"] as const;

const V1_PURCHASE_KEYS = ["capability", "buyer", "vendor", "item", "price", "root", "at"] as const;

/** V1 purchases live in the V1 market under their own ids, so they are keyed "v1:pur_N" here. */
function v1Purchase(id: string, raw: RawRecord | null): Purchase {
  const base = fillRecord(raw, V1_PURCHASE_KEYS);
  const rec = fillRecord(null, PURCHASE_KEYS) as unknown as Purchase;
  Object.assign(rec, base);
  rec.id = id;
  rec.market = "v1";
  rec.status = "PAID";
  rec.paid = rec.price;
  rec.refunded = "0";
  return rec;
}

const PERSIST_KEY = "mandate.store.v3";

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RawRecord;
}

function fillRecord(map: RawRecord | null, keys: readonly string[]): RawRecord {
  const out: RawRecord = {};
  for (const k of keys) {
    const v = map ? map[k] : undefined;
    out[k] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

function asSafeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : fallback;
}

interface SnapshotShape {
  takenAt: string;
  counts: { mandates: number; items: number; capabilities: number };
  mandates: RawRecord[];
  items: RawRecord[];
  capabilities: RawRecord[];
  vendorNames: Record<string, string>;
  spent: Record<string, number>;
  escrow: Record<string, number>;
  purchases: Record<string, string>;
  purchaseRecords: Record<string, RawRecord>;
}

const snapshot = snapshotData as unknown as SnapshotShape;

function emptyStore(): Store {
  return {
    mandates: {},
    items: {},
    capabilities: {},
    vendorNames: {},
    spent: {},
    escrow: {},
    purchases: {},
    purchaseRecords: {},
    totalMinted: null,
    vaultBalance: null,
    heldTotal: null,
    final: new Set<string>(),
  };
}

function storeFromSnapshot(): Store {
  const store = emptyStore();
  for (const raw of snapshot.mandates) {
    const rec = fillRecord(raw, MANDATE_KEYS) as unknown as Mandate;
    store.mandates[rec.id] = rec;
    store.final.add(rec.id);
  }
  for (const raw of snapshot.items) {
    const rec = fillRecord(raw, ITEM_KEYS) as unknown as Item;
    store.items[rec.id] = rec;
  }
  for (const raw of snapshot.capabilities) {
    const rec = fillRecord(raw, CAPABILITY_KEYS) as unknown as Capability;
    store.capabilities[rec.id] = rec;
    store.final.add(rec.id);
  }
  for (const [addr, name] of Object.entries(snapshot.vendorNames)) {
    store.vendorNames[addr.toLowerCase()] = name;
  }
  for (const [id, n] of Object.entries(snapshot.spent)) store.spent[id] = asSafeNumber(n, 0);
  for (const [id, n] of Object.entries(snapshot.escrow)) store.escrow[id] = asSafeNumber(n, 0);
  for (const [capId, purId] of Object.entries(snapshot.purchases)) {
    store.purchases[capId] = "v1:" + purId;
  }
  for (const [purId, raw] of Object.entries(snapshot.purchaseRecords)) {
    store.purchaseRecords["v1:" + purId] = v1Purchase("v1:" + purId, raw);
  }
  return store;
}

interface PersistShape {
  mandates: Record<string, Mandate>;
  items: Record<string, Item>;
  capabilities: Record<string, Capability>;
  vendorNames: Record<string, string>;
  spent: Record<string, number>;
  escrow: Record<string, number>;
  purchases: Record<string, string>;
  purchaseRecords: Record<string, Purchase>;
}

function mergePersisted(store: Store): Store {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PERSIST_KEY);
  } catch {
    return store;
  }
  if (!raw) return store;
  let saved: Partial<PersistShape>;
  try {
    saved = JSON.parse(raw) as Partial<PersistShape>;
  } catch {
    return store;
  }
  const out: Store = { ...store };
  out.mandates = { ...store.mandates, ...(saved.mandates ?? {}) };
  out.items = { ...store.items, ...(saved.items ?? {}) };
  out.capabilities = { ...store.capabilities, ...(saved.capabilities ?? {}) };
  out.vendorNames = { ...store.vendorNames, ...(saved.vendorNames ?? {}) };
  out.spent = { ...store.spent, ...(saved.spent ?? {}) };
  out.escrow = { ...store.escrow, ...(saved.escrow ?? {}) };
  out.purchases = { ...store.purchases, ...(saved.purchases ?? {}) };
  out.purchaseRecords = { ...store.purchaseRecords, ...(saved.purchaseRecords ?? {}) };
  out.final = new Set(store.final);
  return out;
}

/** The live store reads the V2 registry and V2 market only. It starts from what this browser last saw. */
export function initialStore(): Store {
  return mergePersisted(emptyStore());
}

/**
 * The finished V1 proof run on the V1 registry, shipped as a snapshot. Every record in it is final.
 * It is kept apart from the live store because the two registries number their records independently.
 */
export const V1_RECORD: Store = storeFromSnapshot();

function persist(store: Store): void {
  try {
    const data: PersistShape = {
      mandates: store.mandates,
      items: store.items,
      capabilities: store.capabilities,
      vendorNames: store.vendorNames,
      spent: store.spent,
      escrow: store.escrow,
      purchases: store.purchases,
      purchaseRecords: store.purchaseRecords,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch {
    return;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function liveCount(kind: "registry" | "market", fn: string): Promise<number> {
  const raw =
    kind === "registry" ? await readRegistry<unknown>(fn, []) : await readMarket<unknown>(fn, []);
  const n = Number(normalize(raw, "top"));
  return Number.isSafeInteger(n) ? Math.max(0, n) : 0;
}

function gauge(finalSet: Set<string>, id: string, m: Mandate, byId: Map<string, Mandate>): void {
  const root = byId.get(m.root_id);
  if (root && root.status === "REVOKED") {
    finalSet.add(id);
    return;
  }
  const expiry = root ? Number(root.expiry) : Number.NaN;
  if (Number.isFinite(expiry) && expiry < nowSeconds()) {
    finalSet.add(id);
  }
}

export async function refreshLive(current: Store): Promise<Store> {
  const out = mergePersisted(current);
  const mandates = { ...out.mandates };
  const items = { ...out.items };
  const capabilities = { ...out.capabilities };
  const vendorNames = { ...out.vendorNames };
  const spent = { ...out.spent };
  const escrow = { ...out.escrow };
  const purchases = { ...out.purchases };
  const purchaseRecords = { ...out.purchaseRecords };
  const final = new Set<string>(out.final);

  const mandateCount = await liveCount("registry", "get_mandate_count");
  const itemCount = await liveCount("registry", "get_item_count");
  const capabilityCount = await liveCount("registry", "get_capability_count");

  const liveMandateIds: string[] = [];
  for (let i = 0; i < mandateCount; i++) {
    const id = `m_${i}`;
    liveMandateIds.push(id);
    if (mandates[id] && final.has(id)) continue;
    const raw = asRecord(normalize(await readRegistry<unknown>("get_mandate", [id])));
    if (!raw) continue;
    const rec = fillRecord(raw, MANDATE_KEYS) as unknown as Mandate;
    mandates[id] = rec;
  }

  const liveItemIds: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    const id = `item_${i}`;
    liveItemIds.push(id);
    if (items[id]) continue;
    const raw = asRecord(normalize(await readRegistry<unknown>("get_item", [id])));
    if (!raw) continue;
    const rec = fillRecord(raw, ITEM_KEYS) as unknown as Item;
    items[id] = rec;
  }

  const liveCapabilityIds: string[] = [];
  for (let i = 0; i < capabilityCount; i++) {
    const id = `c_${i}`;
    liveCapabilityIds.push(id);
    if (capabilities[id] && final.has(id)) continue;
    const raw = asRecord(normalize(await readRegistry<unknown>("get_capability", [id])));
    if (!raw) continue;
    const rec = fillRecord(raw, CAPABILITY_KEYS) as unknown as Capability;
    capabilities[id] = rec;
  }

  const unknownVendors = new Set<string>();
  for (const id of liveItemIds) {
    const it = items[id];
    if (!it) continue;
    const addr = it.vendor.toLowerCase();
    if (addr !== "" && vendorNames[addr] === undefined) unknownVendors.add(addr);
  }
  for (const addr of unknownVendors) {
    const raw = await readRegistry<unknown>("get_vendor", [addr]);
    const name = typeof raw === "string" ? raw : "";
    if (name !== "") vendorNames[addr] = name;
  }

  const byId = new Map(Object.values(mandates).map((m) => [m.id, m]));
  for (const id of liveMandateIds) {
    const m = mandates[id];
    if (!m || final.has(id)) continue;
    gauge(final, id, m, byId);
  }
  for (const id of liveCapabilityIds) {
    const c = capabilities[id];
    if (!c || final.has(id)) continue;
    if (final.has(c.mandate_id)) final.add(id);
  }

  const nonFinalMandates = liveMandateIds.filter((id) => !final.has(id) && mandates[id]);
  const nonFinalRoots = nonFinalMandates.filter((id) => mandates[id].parent_id === "");

  for (const id of nonFinalMandates) {
    const raw = await readMarket<unknown>("get_spent", [id]);
    spent[id] = asSafeNumber(normalize(raw, "top"), spent[id] ?? 0);
  }
  for (const id of nonFinalRoots) {
    const raw = await readMarket<unknown>("get_escrow", [id]);
    escrow[id] = asSafeNumber(normalize(raw, "top"), escrow[id] ?? 0);
  }
  // V2 purchases: every record that is still open is read again, settled ones are kept as they are.
  const v2Count = await liveCount("market", "get_purchase_count");
  for (let i = 0; i < v2Count; i++) {
    const purId = `pur_${i}`;
    const known = purchaseRecords[purId];
    if (known && known.market === "v2" && !purchaseIsOpen(known)) {
      purchases[known.capability] = purId;
      continue;
    }
    const recRaw = asRecord(normalize(await readMarket<unknown>("get_purchase", [purId])));
    if (!recRaw || !recRaw["id"]) continue;
    const rec = fillRecord(recRaw, PURCHASE_KEYS) as unknown as Purchase;
    rec.market = "v2";
    purchaseRecords[purId] = rec;
    purchases[rec.capability] = purId;
  }

  const computed: Store = {
    mandates,
    items,
    capabilities,
    vendorNames,
    spent,
    escrow,
    purchases,
    purchaseRecords,
    totalMinted: await liveCount("market", "get_total_minted"),
    vaultBalance: await liveCount("market", "get_vault_balance"),
    heldTotal: await liveCount("market", "get_held_total"),
    final,
  };

  persist(computed);
  return computed;
}
