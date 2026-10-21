import type { Capability, Mandate } from "./mandate";
import type { Store } from "./store";
import { LIVE_RUN_ROOT } from "./contracts";
import { effectiveState } from "./tree";

export type Lane = "spine" | "gutter";

export interface MandateRow {
  kind: "mandate";
  key: string;
  depth: number;
  lane: Lane;
  state: string;
  mandate: Mandate;
  paidPath: boolean;
}

export interface SlipRow {
  kind: "slip";
  key: string;
  depth: number;
  lane: Lane;
  cap: Capability;
  purchaseId: string;
  paid: boolean;
}

export type Row = MandateRow | SlipRow;

function idNumber(id: string): number {
  const match = id.match(/_(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Root mandates, live proof run first, then newest first. */
export function rootsOf(store: Store): Mandate[] {
  const roots = Object.values(store.mandates).filter((m) => m.parent_id === "");
  return roots.sort((a, b) => {
    if (a.id === LIVE_RUN_ROOT) return -1;
    if (b.id === LIVE_RUN_ROOT) return 1;
    return idNumber(b.id) - idNumber(a.id);
  });
}

/** True once money actually reached the vendor for this capability. */
export function isPaid(store: Store, capId: string): boolean {
  const id = store.purchases[capId];
  const p = id ? store.purchaseRecords[id] : undefined;
  return p !== undefined && Number(p.paid) > 0;
}

/** Every mandate id on the path from the root to each paid capability's mandate. */
function paidMandates(store: Store): Set<string> {
  const out = new Set<string>();
  for (const cap of Object.values(store.capabilities)) {
    if (!isPaid(store, cap.id)) continue;
    let cur: Mandate | undefined = store.mandates[cap.mandate_id];
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.add(cur.id);
      cur = cur.parent_id === "" ? undefined : store.mandates[cur.parent_id];
    }
  }
  return out;
}

/**
 * Flattens one delegation tree into ledger rows, in reading order.
 * Mandates and purchase requests that validators refused go to the gutter;
 * everything else stays on the spine. A mandate's purchase requests follow it
 * directly, before its own delegations.
 */
export function buildRows(store: Store, rootId: string, now: number): Row[] {
  const byId = store.mandates;
  const root = byId[rootId];
  if (!root) return [];

  const children: Record<string, Mandate[]> = {};
  for (const m of Object.values(byId)) {
    if (m.parent_id === "") continue;
    (children[m.parent_id] ??= []).push(m);
  }
  for (const list of Object.values(children)) {
    list.sort((a, b) => idNumber(a.id) - idNumber(b.id));
  }

  const capsBy: Record<string, Capability[]> = {};
  for (const c of Object.values(store.capabilities)) {
    (capsBy[c.mandate_id] ??= []).push(c);
  }
  for (const list of Object.values(capsBy)) {
    list.sort((a, b) => idNumber(a.id) - idNumber(b.id));
  }

  const paid = paidMandates(store);
  const rows: Row[] = [];
  const seen = new Set<string>();

  const walk = (m: Mandate, depth: number) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    rows.push({
      kind: "mandate",
      key: m.id,
      depth,
      lane: m.status === "REFUSED" ? "gutter" : "spine",
      state: effectiveState(m, byId, now),
      mandate: m,
      paidPath: paid.has(m.id),
    });
    for (const cap of capsBy[m.id] ?? []) {
      rows.push({
        kind: "slip",
        key: cap.id,
        depth: depth + 1,
        lane: cap.status === "REFUSED" ? "gutter" : "spine",
        cap,
        purchaseId: store.purchases[cap.id] ?? "",
        paid: isPaid(store, cap.id),
      });
    }
    for (const child of children[m.id] ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return rows;
}

export interface ChainSummary {
  mandates: number;
  ejected: number;
  held: number;
  requests: number;
  refusedRequests: number;
  paid: number;
}

export function summarize(rows: Row[]): ChainSummary {
  const s: ChainSummary = { mandates: 0, ejected: 0, held: 0, requests: 0, refusedRequests: 0, paid: 0 };
  for (const r of rows) {
    if (r.kind === "mandate") {
      s.mandates += 1;
      if (r.mandate.status === "REFUSED") s.ejected += 1;
      if (r.mandate.status === "HELD") s.held += 1;
    } else {
      s.requests += 1;
      if (r.cap.status === "REFUSED") s.refusedRequests += 1;
      if (r.paid) s.paid += 1;
    }
  }
  return s;
}
