import type { Mandate } from "./mandate";

export interface MandateNode {
  mandate: Mandate;
  children: MandateNode[];
}

function idNumber(id: string): number {
  const match = id.match(/_(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function expired(expiry: string, now: number): boolean {
  const n = Number(expiry);
  return Number.isFinite(n) && now > n;
}

export function buildForest(mandates: Mandate[]): MandateNode[] {
  const byId: Record<string, MandateNode> = {};
  for (const m of mandates) {
    byId[m.id] = { mandate: m, children: [] };
  }
  const roots: MandateNode[] = [];
  for (const m of mandates) {
    const parent = m.parent_id === "" ? null : byId[m.parent_id];
    if (parent) {
      parent.children.push(byId[m.id]);
    } else {
      roots.push(byId[m.id]);
    }
  }
  for (const node of Object.values(byId)) {
    node.children.sort((a, b) => idNumber(a.mandate.id) - idNumber(b.mandate.id));
  }
  roots.sort((a, b) => {
    const ta = Number(a.mandate.created_at) || 0;
    const tb = Number(b.mandate.created_at) || 0;
    if (tb !== ta) return tb - ta;
    return idNumber(b.mandate.id) - idNumber(a.mandate.id);
  });
  return roots;
}

export function effectiveState(
  mandate: Mandate,
  byId: Record<string, Mandate>,
  now: number
): string {
  const own = mandate.status;
  if (own !== "ACTIVE") return own;
  if (expired(mandate.expiry, now)) return "DEAD";
  const seen = new Set<string>([mandate.id]);
  let cur = mandate;
  while (cur.parent_id !== "") {
    const parent = byId[cur.parent_id];
    if (!parent || seen.has(parent.id)) return "DEAD";
    seen.add(parent.id);
    if (parent.status !== "ACTIVE") return "DEAD";
    if (expired(parent.expiry, now)) return "DEAD";
    cur = parent;
  }
  return "ACTIVE";
}

export function chainOf(id: string, byId: Record<string, Mandate>): Mandate[] {
  const out: Mandate[] = [];
  const seen = new Set<string>();
  let cur = byId[id];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = byId[cur.parent_id];
  }
  return out.reverse();
}
