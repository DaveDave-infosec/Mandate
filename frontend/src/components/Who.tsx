import { KNOWN_ACTORS } from "../lib/contracts";
import { useWallet } from "../lib/wallet";
import { shortenAddress } from "./Addr";

/** Compact party name: a known label when there is one, otherwise the short address. */
export default function Who({ addr, names }: { addr: string; names?: Record<string, string> }) {
  const { wallets } = useWallet();
  const lower = addr.toLowerCase();
  const label =
    KNOWN_ACTORS[lower] ??
    names?.[lower] ??
    wallets.find((w) => w.address.toLowerCase() === lower)?.label ??
    "";
  return (
    <span className={label ? "who" : "who who--addr mono"} title={addr}>
      {label || shortenAddress(addr)}
    </span>
  );
}
