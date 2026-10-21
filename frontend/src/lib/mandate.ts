import { normalize, readMarket, readRegistry, type JsonValue } from "./rpc";

export interface Mandate {
  id: string;
  parent_id: string;
  root_id: string;
  depth: string;
  grantor: string;
  grantee: string;
  text: string;
  text_hash: string;
  cap: string;
  expiry: string;
  categories: string;
  vendors: string;
  status: string;
  path: string;
  reasoning: string;
  minority_note: string;
  violated_restriction: string;
  escalated: string;
  created_at: string;
  verdict: string;
  escalation_verdict: string;
  escalation_reasoning: string;
  escalation_minority_note: string;
  escalated_by: string;
}

export interface Capability {
  id: string;
  status: string;
  grantee: string;
  item_id: string;
  price: string;
  mandate_id: string;
  vendor: string;
  category: string;
  path: string;
  verdict: string;
  reasoning: string;
  minority_note: string;
  violated_restriction: string;
  escalated: string;
  escalation_verdict: string;
  escalation_reasoning: string;
  escalation_minority_note: string;
  escalated_by: string;
  created_at: string;
}

export interface Item {
  id: string;
  vendor: string;
  category: string;
  title: string;
  description: string;
  price: string;
}

/** A V2 purchase record, as the market returns it. V1 purchases are mapped onto the same shape. */
export interface Purchase {
  id: string;
  market: string; // "v1" or "v2"
  capability: string;
  buyer: string;
  vendor: string;
  item: string;
  price: string;
  root: string;
  mandate: string;
  hops: string;
  at: string;
  deliver_by: string;
  status: string;
  url: string;
  delivered_at: string;
  verdict: string;
  reasoning: string;
  minority_note: string;
  violated_restriction: string;
  evidence: string;
  escalated: string;
  escalation_verdict: string;
  escalation_reasoning: string;
  escalation_minority_note: string;
  escalation_evidence: string;
  escalated_by: string;
  band: string;
  band_source: string;
  challenge_until: string;
  challenged: string;
  challenger: string;
  challenger_role: string;
  challenge_text: string;
  challenge_verdict: string;
  challenge_reasoning: string;
  challenge_minority_note: string;
  challenge_evidence: string;
  challenge_violated_restriction: string;
  paid: string;
  refunded: string;
  settled_at: string;
  settled_by: string;
}

const MANDATE_KEYS: readonly (keyof Mandate)[] = [
  "id",
  "parent_id",
  "root_id",
  "depth",
  "grantor",
  "grantee",
  "text",
  "text_hash",
  "cap",
  "expiry",
  "categories",
  "vendors",
  "status",
  "path",
  "reasoning",
  "minority_note",
  "violated_restriction",
  "escalated",
  "created_at",
  "verdict",
  "escalation_verdict",
  "escalation_reasoning",
  "escalation_minority_note",
  "escalated_by",
];

const CAPABILITY_KEYS: readonly (keyof Capability)[] = [
  "id",
  "status",
  "grantee",
  "item_id",
  "price",
  "mandate_id",
  "vendor",
  "category",
  "path",
  "verdict",
  "reasoning",
  "minority_note",
  "violated_restriction",
  "escalated",
  "escalation_verdict",
  "escalation_reasoning",
  "escalation_minority_note",
  "escalated_by",
  "created_at",
];

const ITEM_KEYS: readonly (keyof Item)[] = [
  "id",
  "vendor",
  "category",
  "title",
  "description",
  "price",
];

export const PURCHASE_KEYS: readonly (keyof Purchase)[] = [
  "id", "market", "capability", "buyer", "vendor", "item", "price", "root", "mandate", "hops", "at",
  "deliver_by", "status", "url", "delivered_at", "verdict", "reasoning", "minority_note",
  "violated_restriction", "evidence", "escalated", "escalation_verdict", "escalation_reasoning",
  "escalation_minority_note", "escalation_evidence", "escalated_by", "band", "band_source",
  "challenge_until", "challenged", "challenger", "challenger_role", "challenge_text", "challenge_verdict",
  "challenge_reasoning", "challenge_minority_note", "challenge_evidence", "challenge_violated_restriction",
  "paid", "refunded", "settled_at", "settled_by",
];

/** Purchases still waiting on a delivery, a verdict or a settlement. */
export function purchaseIsOpen(p: Purchase): boolean {
  return p.market === "v2" && p.status !== "SETTLED" && p.status !== "EXPIRED";
}

type RecordMap = Record<string, unknown>;

function asRecord(value: JsonValue | null): RecordMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordMap;
}

function fillRecord(map: RecordMap | null, keys: readonly string[]): RecordMap {
  const out: RecordMap = {};
  for (const k of keys) {
    const v = map ? map[k] : undefined;
    out[k] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function getMandate(id: string): Promise<Mandate | null> {
  const raw = asRecord(normalize(await readRegistry("get_mandate", [id])));
  if (!raw) return null;
  return fillRecord(raw, MANDATE_KEYS) as unknown as Mandate;
}

export async function getChain(id: string): Promise<Mandate[]> {
  const raw = normalize(await readRegistry("get_chain", [id]));
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const r = fillRecord(asRecord(entry), MANDATE_KEYS);
    return r as unknown as Mandate;
  });
}

export async function getMandateCount(): Promise<number> {
  const raw = normalize(await readRegistry("get_mandate_count", []), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getAllMandates(): Promise<Mandate[]> {
  const count = await getMandateCount();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(`m_${i}`);
  const found = await Promise.all(ids.map((id) => getMandate(id)));
  return found.filter((m): m is Mandate => m !== null);
}

export async function isChainValid(id: string, now: number): Promise<boolean> {
  const raw = normalize(await readRegistry("is_chain_valid", [id, now]));
  return raw === true;
}

export async function getItem(id: string): Promise<Item | null> {
  const raw = asRecord(normalize(await readRegistry("get_item", [id])));
  if (!raw) return null;
  return fillRecord(raw, ITEM_KEYS) as unknown as Item;
}

export async function getItemCount(): Promise<number> {
  const raw = normalize(await readRegistry("get_item_count", []), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getAllItems(): Promise<Item[]> {
  const count = await getItemCount();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(`item_${i}`);
  const found = await Promise.all(ids.map((id) => getItem(id)));
  return found.filter((it): it is Item => it !== null);
}

export async function getVendorName(addr: string): Promise<string> {
  const raw = normalize(await readRegistry("get_vendor", [addr]));
  return typeof raw === "string" ? raw : "";
}

export async function getCapability(id: string): Promise<Capability | null> {
  const raw = asRecord(normalize(await readRegistry("get_capability", [id])));
  if (!raw) return null;
  return fillRecord(raw, CAPABILITY_KEYS) as unknown as Capability;
}

export async function getCapabilityIdsForMandate(id: string): Promise<string[]> {
  const raw = normalize(await readRegistry("get_capability_ids_for_mandate", [id]));
  const csv = typeof raw === "string" ? raw.trim() : "";
  if (!csv) return [];
  return csv
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function getCapabilityCount(): Promise<number> {
  const raw = normalize(await readRegistry("get_capability_count", []), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getAllCapabilities(): Promise<Capability[]> {
  const count = await getCapabilityCount();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(`c_${i}`);
  const found = await Promise.all(ids.map((id) => getCapability(id)));
  return found.filter((c): c is Capability => c !== null);
}

export async function balanceOf(addr: string): Promise<number> {
  const raw = normalize(await readMarket("balance_of", [addr]), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getVaultBalance(): Promise<number> {
  const raw = normalize(await readMarket("get_vault_balance", []), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getEscrow(rootId: string): Promise<number> {
  const raw = normalize(await readMarket("get_escrow", [rootId]), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getSpent(id: string): Promise<number> {
  const raw = normalize(await readMarket("get_spent", [id]), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function isConsumed(capId: string): Promise<boolean> {
  const raw = normalize(await readMarket("is_consumed", [capId]));
  return raw === true;
}

export async function getPurchaseForCapability(capId: string): Promise<string> {
  const raw = normalize(await readMarket("get_purchase_for_capability", [capId]));
  return typeof raw === "string" ? raw : "";
}

export async function getPurchase(purId: string): Promise<Purchase | null> {
  const raw = asRecord(normalize(await readMarket("get_purchase", [purId])));
  if (!raw || !raw["id"]) return null;
  const rec = fillRecord(raw, PURCHASE_KEYS) as unknown as Purchase;
  rec.market = "v2";
  return rec;
}

export async function getTotalMinted(): Promise<number> {
  const raw = normalize(await readMarket("get_total_minted", []), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getMaxSupply(): Promise<number> {
  const raw = normalize(await readMarket("get_max_supply", []), "top");
  return typeof raw === "number" ? raw : 0;
}

export async function getIssuer(): Promise<string> {
  const raw = normalize(await readMarket("get_issuer", []));
  return typeof raw === "string" ? raw : "";
}
