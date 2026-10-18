import { useEffect, useMemo, useState } from "react";
import { balanceOf } from "../lib/mandate";
import { LIVE_RUN_ROOT } from "../lib/contracts";
import { SLOT_LABELS, useWallet, type SlotLabel } from "../lib/wallet";
import { useStore } from "../lib/useStore";
import { buildRows, nowSeconds, rootsOf, summarize, type ChainSummary } from "../lib/ledger";
import { effectiveState } from "../lib/tree";
import Ledger from "../components/Ledger";
import StateBadge from "../components/StateBadge";
import Addr from "../components/Addr";
import Who from "../components/Who";
import {
  IssueRootPanel,
  MandateActions,
  MintPanel,
  SlipActions,
  VendorPanel,
  mandateAvailability,
  slipAvailability,
  type DoneHandler,
} from "../components/act/forms";
import type { Row } from "../lib/ledger";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function summaryLine(s: ChainSummary): string {
  const parts = [plural(s.mandates, "mandate", "mandates")];
  if (s.ejected > 0) parts.push(`${s.ejected} ejected by validators`);
  if (s.held > 0) parts.push(`${s.held} held`);
  if (s.requests > 0) parts.push(plural(s.requests, "purchase request", "purchase requests"));
  if (s.refusedRequests > 0) parts.push(`${s.refusedRequests} refused`);
  if (s.paid > 0) parts.push(`${s.paid} paid`);
  return parts.join(", ") + ".";
}

function CopyAddress({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-btn"
      onClick={() => {
        navigator.clipboard
          .writeText(addr)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => window.prompt("Copy this address:", addr));
      }}
    >
      {copied ? "Copied" : "Copy address"}
    </button>
  );
}

function WalletBar({ version, onDone }: { version: number; onDone: DoneHandler }) {
  const { wallets, active, connecting, walletError, selectWallet, createWallet, connectMetaMask } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBalance(null);
    if (!active) return;
    balanceOf(active.address.toLowerCase())
      .then((b) => {
        if (!cancelled) setBalance(b);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, version]);

  return (
    <section className="wallets" aria-label="Wallets">
      <div className="wallets__row">
        <span className="wallets__label">Act as</span>
        {SLOT_LABELS.map((label) => {
          const slot = wallets.find((w) => w.label === label);
          const on = active?.kind === "session" && active.label === label;
          return slot ? (
            <button
              key={label}
              type="button"
              className={"chip chip--wallet" + (on ? " chip--on" : "")}
              aria-pressed={on}
              onClick={() => selectWallet(label as SlotLabel)}
            >
              {label}
            </button>
          ) : (
            <button
              key={label}
              type="button"
              className="chip chip--create"
              onClick={() => createWallet(label as SlotLabel)}
            >
              Create {label}
            </button>
          );
        })}
        <button
          type="button"
          className={"chip chip--wallet" + (active?.kind === "metamask" ? " chip--on" : "")}
          onClick={connectMetaMask}
          disabled={connecting}
        >
          {connecting ? "Connecting..." : "MetaMask"}
        </button>
      </div>
      <p className="wallets__status">
        {active ? (
          <>
            Signing as <Addr addr={active.address} name={active.label} />
            {balance !== null && <span className="mono">, {balance.toLocaleString("en-US")} GEN in the market</span>}{" "}
            <CopyAddress addr={active.address} />
          </>
        ) : (
          "Pick or create a wallet to act. Reading needs none."
        )}
      </p>
      {walletError !== "" && (
        <p className="wallets__error" role="alert">
          {walletError}
        </p>
      )}
      <p className="wallets__note">
        Session wallets live in this browser only. They are testnet keys. Funding escrow needs GEN, which only the
        issuer can mint; everything else works from a fresh wallet.
      </p>
      <MintPanel onDone={onDone} />
    </section>
  );
}

export function ConsolePage() {
  const { store, refreshing, lastRefreshed, error, refresh } = useStore();
  const { active } = useWallet();
  const me = active ? active.address.toLowerCase() : "";
  const [focus, setFocus] = useState("");
  const roots = useMemo(() => rootsOf(store), [store]);
  const [rootId, setRootId] = useState(LIVE_RUN_ROOT);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(["m_2"]));
  const now = nowSeconds();

  const activeRoot = store.mandates[rootId] ? rootId : (roots[0]?.id ?? "");
  const root = store.mandates[activeRoot];
  const rows = useMemo(() => buildRows(store, activeRoot, now), [store, activeRoot, now]);
  const summary = useMemo(() => summarize(rows), [rows]);

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // After a write, open the record it created or changed once the refresh brings it in.
  useEffect(() => {
    if (focus === "") return;
    const m = store.mandates[focus];
    const c = store.capabilities[focus];
    if (!m && !c) return;
    const rootOf = m ? m.root_id : store.mandates[c!.mandate_id]?.root_id;
    if (rootOf) setRootId(rootOf);
    setOpenIds((prev) => new Set(prev).add(focus));
    setFocus("");
  }, [focus, store]);

  const onDone: DoneHandler = (newId) => {
    if (newId) setFocus(newId);
    refresh();
  };

  const renderActions = (row: Row) =>
    row.kind === "mandate" ? (
      <MandateActions m={row.mandate} store={store} now={now} onDone={onDone} />
    ) : (
      <SlipActions cap={row.cap} store={store} now={now} onDone={onDone} />
    );

  const canAct = (row: Row) => {
    if (me === "") return false;
    if (row.kind === "mandate") return Object.values(mandateAvailability(row.mandate, me, store, now)).some(Boolean);
    const a = slipAvailability(row.cap, me, store, now);
    return a.purchase || a.escalate;
  };

  const rootState = root ? effectiveState(root, store.mandates, now) : "";
  const rootExpired = root ? Number(root.expiry) < now : false;

  return (
    <main className="console">
      <header className="console__head">
        <div>
          <h1 className="console__title">Console</h1>
          <p className="console__lede">
            Authority flows down the spine. Anything validators refused is ejected to the right, with a red rule from
            the hop it tried to widen.
          </p>
        </div>
        <div className="console__sync">
          <span className="console__stamp" aria-live="polite">
            {refreshing
              ? "Checking the chain for new records..."
              : lastRefreshed
                ? `Checked the chain at ${lastRefreshed.toTimeString().slice(0, 5)}`
                : "Showing the shipped record"}
          </span>
          <button type="button" className="btn" onClick={refresh} disabled={refreshing}>
            Check again
          </button>
        </div>
      </header>

      {error !== "" && (
        <div className="notice notice--error" role="alert">
          <p>Could not reach the chain: {error}</p>
          <p className="notice__sub">The records below are the shipped snapshot of every finished chain.</p>
        </div>
      )}

      <WalletBar version={lastRefreshed ? lastRefreshed.getTime() : 0} onDone={onDone} />
      <IssueRootPanel store={store} onDone={onDone} />

      {roots.length > 1 && (
        <nav className="chains" aria-label="Delegation chains">
          {roots.map((r) => (
            <button
              key={r.id}
              type="button"
              className={"chains__tab" + (r.id === activeRoot ? " chains__tab--on" : "")}
              aria-pressed={r.id === activeRoot}
              onClick={() => setRootId(r.id)}
            >
              <span className="mono">{r.id}</span>
              <span className="chains__text">{r.text}</span>
            </button>
          ))}
        </nav>
      )}

      {!root ? (
        <p className="empty">No root mandates on chain yet. A principal issues the first one.</p>
      ) : (
        <>
          <section className="charter" aria-label="Root mandate">
            <p className="charter__by">
              {activeRoot === LIVE_RUN_ROOT && <span className="charter__tag">Live proof run</span>}
              Root <span className="mono">{root.id}</span>, written by <Who addr={root.grantor} /> for{" "}
              <Who addr={root.grantee} />
            </p>
            <blockquote className="charter__text">{root.text}</blockquote>
            <p className="charter__state">
              <StateBadge state={rootState} />
              <span>
                {rootState === "REVOKED"
                  ? "Revoked by the principal. Every mandate below is dead by chain walk, and none of their records were rewritten."
                  : rootExpired
                    ? "Expired. Every mandate below is dead by chain walk."
                    : "Live. Every delegation below must fit inside these words."}
              </span>
            </p>
            <p className="charter__summary">{summaryLine(summary)}</p>
          </section>

          <div className="lanes" aria-hidden="true">
            <span>Kept inside the root's authority</span>
            <span>Ejected by validators</span>
          </div>
          <Ledger
            rows={rows}
            store={store}
            openIds={openIds}
            onToggle={toggle}
            renderActions={renderActions}
            canAct={canAct}
          />
        </>
      )}

      <section className="catalog" aria-labelledby="catalog-title">
        <h2 id="catalog-title" className="catalog__title">
          Catalog
        </h2>
        <p className="catalog__lede">
          Vendors write these listings. Validators judge each purchase against this text, never against the buyer's
          own description.
        </p>
        <div className="catalog__act">
          <VendorPanel store={store} onDone={onDone} />
        </div>
        <ul className="catalog__list">
          {Object.values(store.items).map((it) => (
            <li key={it.id} className="listing-row">
              <div className="listing-row__head">
                <span className="listing-row__title">{it.title}</span>
                <span className="listing-row__price mono">{Number(it.price).toLocaleString("en-US")} GEN</span>
              </div>
              <p className="listing-row__meta">
                <span className="mono">{it.id}</span>, {it.category.replace("_", " ")}, sold by{" "}
                <Who addr={it.vendor} names={store.vendorNames} />
              </p>
              <p className="listing-row__desc">{it.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
