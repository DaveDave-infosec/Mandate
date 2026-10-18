import { KNOWN_ACTORS } from "../lib/contracts";
import { useWallet } from "../lib/wallet";

export function shortenAddress(addr: string): string {
  const s = addr.toLowerCase();
  if (!s.startsWith("0x") || s.length !== 42) return addr;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

export default function Addr({ addr, name }: { addr: string; name?: string }) {
  const { wallets, active } = useWallet();
  const lower = addr.toLowerCase();
  let label = KNOWN_ACTORS[lower] ?? "";
  if (!label) {
    const slot = wallets.find((w) => w.address.toLowerCase() === lower);
    if (slot) label = slot.label;
  }
  if (!label && active && active.address.toLowerCase() === lower) {
    label = active.label;
  }
  const shown = name ?? label;
  return (
    <span className="addr" title={addr}>
      {shown ? <span className="addr__label">{shown}</span> : null}
      <span className="addr__short mono">{shortenAddress(addr)}</span>
    </span>
  );
}
