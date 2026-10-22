import { useEffect, useMemo, useState } from "react";
import { balanceOf } from "../lib/mandate";
import { LIVE_RUN_ROOT, V2_RUN_ROOT } from "../lib/contracts";
import { SLOT_LABELS, useWallet, type SlotLabel } from "../lib/wallet";
import { useStore } from "../lib/useStore";
import { V1_RECORD } from "../lib/store";
import { buildRows, nowSeconds, rootsOf, summarize, type ChainSummary } from "../lib/ledger";
import { effectiveState } from "../lib/tree";
import Ledger from "../components/Ledger";
import StateBadge from "../components/StateBadge";
import Addr from "../components/Addr";
import Who from "../components/Who";
import { PurchaseLine, fmtGen } from "../components/Delivery";
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
  const [rootId, setRootIdRaw] = useState(V2_RUN_ROOT);
  const [source, setSource] = useState<"live" | "v1">("live");
  const setRootId = (id: string) => {
    setSource("live");
    setRootIdRaw(id);
  };
  const [openLive, setOpenLive] = useState<Set<string>>(() => new Set());
  const [openV1, setOpenV1] = useState<Set<string>>(() => new Set(["m_2"]));
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const [scrollTo, setScrollTo] = useState("");
  useEffect(() => {
    if (scrollTo === "") return;
    const t = window.setTimeout(() => {
      document.getElementById(`row-${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setScrollTo("");
    }, 80);
    return () => window.clearTimeout(t);
  }, [scrollTo]);
  const now = nowSeconds();
  const v2Purchases = useMemo(
    () =>
      Object.values(store.purchaseRecords)
        .filter((p) => p.market === "v2")
        .sort((a, b) => Number(b.id.replace("pur_", "")) - Number(a.id.replace("pur_", ""))),
    [store]
  );
  const openPurchase = (capId: string, rootOfIt: string) => {
    setRootId(rootOfIt);
    setOpenLive((prev) => new Set(prev).add(capId));
    setScrollTo(capId);
  };

  // The V1 record lives on the V1 registry, apart from the live store: both registries number from m_0.
  const view: "live" | "v1" = source === "live" && roots.length === 0 ? "v1" : source;
  const viewStore = view === "v1" ? V1_RECORD : store;
  const activeRoot = view === "v1" ? LIVE_RUN_ROOT : store.mandates[rootId] ? rootId : (roots[0]?.id ?? "");
  const root = viewStore.mandates[activeRoot];
  const rows = useMemo(() => buildRows(viewStore, activeRoot, now), [viewStore, activeRoot, now]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const openIds = view === "v1" ? openV1 : openLive;
  const setOpenIds = view === "v1" ? setOpenV1 : setOpenLive;

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
    setOpenLive((prev) => new Set(prev).add(focus));
    setFocus("");
  }, [focus, store]);

  const onDone: DoneHandler = (newId) => {
    if (newId) setFocus(newId);
    refresh();
  };

  const renderActions = (row: Row) =>
    view === "v1" ? null : row.kind === "mandate" ? (
      <MandateActions m={row.mandate} store={store} now={now} onDone={onDone} />
    ) : (
      <SlipActions cap={row.cap} store={store} now={now} onDone={onDone} />
    );

  const canAct = (row: Row) => {
    if (me === "" || view === "v1") return false;
    if (row.kind === "mandate") return Object.values(mandateAvailability(row.mandate, me, store, now)).some(Boolean);
    return Object.values(slipAvailability(row.cap, me, store, now)).some(Boolean);
  };

  const rootState = root ? effectiveState(root, viewStore.mandates, now) : "";
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

      <nav className="chains" aria-label="Delegation chains">
        {roots.map((r) => {
          const on = view === "live" && r.id === activeRoot;
          return (
            <button
              key={r.id}
              type="button"
              className={"chains__tab" + (on ? " chains__tab--on" : "")}
              aria-pressed={on}
              onClick={() => setRootId(r.id)}
            >
              <span className="mono">{r.id}</span>
              <span className="chains__text">{r.text}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={"chains__tab" + (view === "v1" ? " chains__tab--on" : "")}
          aria-pressed={view === "v1"}
          onClick={() => setSource("v1")}
        >
          <span className="mono">V1 record</span>
          <span className="chains__text">{V1_RECORD.mandates[LIVE_RUN_ROOT]?.text ?? ""}</span>
        </button>
      </nav>

      {!root ? (
        <p className="empty">No root mandates on chain yet. A principal issues the first one.</p>
      ) : (
        <>
          <section className="charter" aria-label="Root mandate">
            <p className="charter__by">
              {view === "v1" && <span className="charter__tag">V1 live proof run, on the V1 registry</span>}
              {view === "live" && activeRoot === V2_RUN_ROOT && <span className="charter__tag">V2 live proof run</span>}
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
            store={viewStore}
            openIds={openIds}
            onToggle={toggle}
            renderActions={renderActions}
            canAct={canAct}
          />
        </>
      )}

      <section className="deliveries" aria-labelledby="deliveries-title">
        <h2 id="deliveries-title" className="catalog__title">
          Deliveries
        </h2>
        <p className="catalog__lede">
          Every purchase in the V2 market. The price is held until validators fetch and read what the vendor delivered,
          grade it, and the challenge window closes.
          {store.heldTotal !== null && store.vaultBalance !== null && (
            <>
              {" "}
              Held right now: <span className="mono">{fmtGen(store.heldTotal)}</span> of the vault's{" "}
              <span className="mono">{fmtGen(store.vaultBalance)}</span>.
            </>
          )}
        </p>
        {v2Purchases.length === 0 ? (
          <p className="empty">No V2 purchases yet. An agent holding an issued request clicks Buy it now.</p>
        ) : (
          <ul className="deliveries__list">
            {v2Purchases.map((p) => {
              const item = store.items[p.item];
              const yours = me !== "" && me === p.vendor.toLowerCase() && p.status === "AWAITING_DELIVERY";
              return (
                <li key={p.id} className={"delivery-row" + (yours ? " delivery-row--yours" : "")} data-status={p.status}>
                  <div className="listing-row__head">
                    <span className="listing-row__title">{item ? item.title : p.item}</span>
                    <span className="listing-row__price mono">{fmtGen(p.price)}</span>
                  </div>
                  <p className="listing-row__meta">
                    <span className="mono">{p.capability}</span> under <span className="mono">{p.mandate}</span>, bought by{" "}
                    <Who addr={p.buyer} /> from <Who addr={p.vendor} names={store.vendorNames} />
                    {yours && <span className="delivery-row__flag">Yours to deliver</span>}
                  </p>
                  <PurchaseLine p={p} store={store} now={now} />
                  <button type="button" className="btn delivery-row__open" onClick={() => openPurchase(p.capability, p.root)}>
                    Open in the ledger
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
