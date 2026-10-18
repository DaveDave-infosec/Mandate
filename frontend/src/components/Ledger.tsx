import type { CSSProperties, ReactNode } from "react";
import type { Capability, Mandate } from "../lib/mandate";
import type { Store } from "../lib/store";
import type { MandateRow, Row, SlipRow } from "../lib/ledger";
import { RECEIPTS, txUrl } from "../lib/contracts";
import StateBadge from "./StateBadge";
import PathBadge from "./PathBadge";
import Addr from "./Addr";
import Who from "./Who";

/** Explorer receipts for the records of the live proof run. */
const RECEIPT_LINKS: Record<string, { label: string; hash: string }> = {
  m_0: { label: "Revocation receipt", hash: RECEIPTS.revoke },
  m_2: { label: "Refusal receipt", hash: RECEIPTS.widening },
  m_6: { label: "Forced review receipt", hash: RECEIPTS.bystanderEscalation },
  c_0: { label: "Refusal receipt", hash: RECEIPTS.adRefusal },
  c_1: { label: "Purchase receipt", hash: RECEIPTS.purchase },
};

function fmtGen(n: number | string): string {
  const v = Number(n);
  return (Number.isFinite(v) ? v.toLocaleString("en-US") : "0") + " GEN";
}

function fmtDate(seconds: string): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "never";
  return new Date(n * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function list(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function Receipt({ id }: { id: string }) {
  const r = RECEIPT_LINKS[id];
  if (!r) return null;
  return (
    <a className="receipt" href={txUrl(r.hash)} target="_blank" rel="noreferrer">
      {r.label} on the explorer
    </a>
  );
}

function Verdict({
  reasoning,
  dissent,
  title,
}: {
  reasoning: string;
  dissent: string;
  title: string;
}) {
  if (reasoning === "" && dissent === "") return null;
  return (
    <div className="verdict">
      <h4 className="verdict__title">{title}</h4>
      {reasoning !== "" && <p className="verdict__reasoning">{reasoning}</p>}
      {dissent !== "" && (
        <div className="verdict__dissent">
          <span className="verdict__dissent-label">Preserved dissent</span>
          <p>{dissent}</p>
        </div>
      )}
    </div>
  );
}

function EscalationLine({ by, verdict }: { by: string; verdict: string }) {
  const tail =
    verdict === "unresolved"
      ? " Authority defaults to not granted."
      : verdict === "narrower" || verdict === "authorized"
        ? " Granted."
        : "";
  return (
    <span className="entry__escalated">
      Held as unclear. A forced review by <Who addr={by} /> returned {verdict}.{tail}
    </span>
  );
}

/* ---------------------------------------------------------------- mandate */

function MandateDetail({ m, store }: { m: Mandate; store: Store }) {
  const cats = list(m.categories);
  const vendors = m.vendors === "*" ? [] : list(m.vendors);
  const spent = store.spent[m.id];
  const isRoot = m.parent_id === "";
  return (
    <div className="entry__more">
      <dl className="facts">
        <div>
          <dt>Granted by</dt>
          <dd>
            <Addr addr={m.grantor} />
          </dd>
        </div>
        <div>
          <dt>Granted to</dt>
          <dd>
            <Addr addr={m.grantee} />
          </dd>
        </div>
        <div>
          <dt>Spend cap</dt>
          <dd className="mono">
            {spent !== undefined ? `${fmtGen(spent)} of ${fmtGen(m.cap)} spent` : fmtGen(m.cap)}
          </dd>
        </div>
        {isRoot && store.escrow[m.id] !== undefined && (
          <div>
            <dt>Escrow left</dt>
            <dd className="mono">{fmtGen(store.escrow[m.id])}</dd>
          </div>
        )}
        <div>
          <dt>Expires</dt>
          <dd>{fmtDate(m.expiry)}</dd>
        </div>
        <div>
          <dt>Categories</dt>
          <dd className="facts__chips">
            {cats.map((c) => (
              <span key={c} className="chip">
                {c.replace("_", " ")}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Vendors</dt>
          <dd className="facts__chips">
            {vendors.length === 0 ? (
              <span className="chip">any vendor</span>
            ) : (
              vendors.map((v) => (
                <span key={v} className="chip">
                  <Who addr={v} names={store.vendorNames} />
                </span>
              ))
            )}
          </dd>
        </div>
      </dl>

      {m.path === "root" && (
        <p className="entry__how">Issued directly by the human. The principal's own words need no judgment.</p>
      )}
      {m.path === "hash" && (
        <p className="entry__how">
          Approved by hash. The text is identical to its parent, so no validator was consulted.
        </p>
      )}
      {m.path === "consensus" && (
        <Verdict
          title={`Validators read the whole chain and returned ${m.verdict || "a verdict"}`}
          reasoning={m.reasoning}
          dissent={m.minority_note}
        />
      )}
      {m.escalated === "1" && (
        <Verdict
          title={`Forced review returned ${m.escalation_verdict}`}
          reasoning={m.escalation_reasoning}
          dissent={m.escalation_minority_note}
        />
      )}
      <Receipt id={m.id} />
    </div>
  );
}

function MandateEntry({
  row,
  store,
  open,
  onToggle,
  actions,
  canAct,
}: {
  row: MandateRow;
  store: Store;
  open: boolean;
  onToggle(): void;
  actions?: ReactNode;
  canAct: boolean;
}) {
  const m = row.mandate;
  const dead = row.state === "DEAD";
  return (
    <article
      className={"entry entry--mandate" + (row.paidPath ? " entry--paid" : "") + (open ? " entry--open" : "")}
      data-state={row.state}
    >
      <button
        type="button"
        className="entry__head"
        aria-expanded={open}
        aria-controls={`more-${m.id}`}
        onClick={onToggle}
      >
        <span className="entry__meta">
          <span className="entry__id mono">{m.id}</span>
          <StateBadge state={row.state} />
          <PathBadge path={m.path} hash={m.text_hash} />
          <span className="entry__parties">
            <Who addr={m.grantor} /> <span aria-hidden="true">to</span> <Who addr={m.grantee} />
          </span>
          <span className="entry__cap mono">cap {fmtGen(m.cap)}</span>
        </span>
        {row.depth === 0 ? (
          <span className="entry__dead">The principal's words, quoted above.</span>
        ) : (
          <span className="entry__text">{m.text}</span>
        )}
        {m.status === "REFUSED" && m.violated_restriction !== "" && (
          <span className="entry__violates">Violates: {m.violated_restriction}</span>
        )}
        {m.escalated === "1" && <EscalationLine by={m.escalated_by} verdict={m.escalation_verdict} />}
        {dead && <span className="entry__dead">Dead by chain walk. Its own record still reads ACTIVE.</span>}
        <span className="entry__toggle" aria-hidden="true">
          {open ? "Hide details" : canAct ? "Why, the full record, and your actions" : "Why, and the full record"}
        </span>
      </button>
      {row.lane === "spine" && (
        <div className="entry__drawer" id={`more-${m.id}`} hidden={!open}>
          {open && <MandateDetail m={m} store={store} />}
          {open && actions && <div className="entry__actions">{actions}</div>}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- slip */

function SlipDetail({ cap, store }: { cap: Capability; store: Store }) {
  const item = store.items[cap.item_id];
  return (
    <div className="entry__more">
      {item && (
        <figure className="listing">
          <figcaption>
            The vendor's listing, which is what validators judged. The agent never describes its own purchase.
          </figcaption>
          <blockquote>{item.description}</blockquote>
        </figure>
      )}
      {cap.path === "precedent" ? (
        <p className="entry__how">
          Issued by precedent. This item was already authorized under this mandate, so no validator was consulted.
        </p>
      ) : (
        <Verdict
          title={`Validators read the chain and the listing and returned ${cap.verdict || "a verdict"}`}
          reasoning={cap.reasoning}
          dissent={cap.minority_note}
        />
      )}
      {cap.escalated === "1" && (
        <Verdict
          title={`Forced review returned ${cap.escalation_verdict}`}
          reasoning={cap.escalation_reasoning}
          dissent={cap.escalation_minority_note}
        />
      )}
      <Receipt id={cap.id} />
    </div>
  );
}

function SlipEntry({
  row,
  store,
  open,
  onToggle,
  actions,
  canAct,
}: {
  row: SlipRow;
  store: Store;
  open: boolean;
  onToggle(): void;
  actions?: ReactNode;
  canAct: boolean;
}) {
  const cap = row.cap;
  const item = store.items[cap.item_id];
  const paid = row.purchaseId !== "";
  return (
    <article
      className={"entry entry--slip" + (paid ? " entry--paid" : "") + (open ? " entry--open" : "")}
      data-state={cap.status}
    >
      <button
        type="button"
        className="entry__head"
        aria-expanded={open}
        aria-controls={`more-${cap.id}`}
        onClick={onToggle}
      >
        <span className="entry__meta">
          <span className="entry__id mono">{cap.id}</span>
          <StateBadge state={cap.status} />
          <span className="entry__kind">purchase request by</span>
          <Who addr={cap.grantee} />
        </span>
        <span className="slip__item">
          <span className="slip__title">{item ? item.title : cap.item_id}</span>
          <span className="slip__price mono">{fmtGen(cap.price)}</span>
        </span>
        {cap.status === "REFUSED" && cap.violated_restriction !== "" && (
          <span className="entry__violates">Violates: {cap.violated_restriction}</span>
        )}
        {cap.escalated === "1" && <EscalationLine by={cap.escalated_by} verdict={cap.escalation_verdict} />}
        {paid && (
          <span className="slip__paid">
            Paid {fmtGen(cap.price)} to <Who addr={cap.vendor} names={store.vendorNames} /> from the root's escrow
            <span className="mono"> {row.purchaseId}</span>
          </span>
        )}
        <span className="entry__toggle" aria-hidden="true">
          {open ? "Hide details" : canAct ? "Why, the listing, and your actions" : "Why, and the vendor's listing"}
        </span>
      </button>
      {row.lane === "spine" && (
        <div className="entry__drawer" id={`more-${cap.id}`} hidden={!open}>
          {open && <SlipDetail cap={cap} store={store} />}
          {open && actions && <div className="entry__actions">{actions}</div>}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- ledger */

function Guides({ depth }: { depth: number }) {
  const out: ReactNode[] = [];
  for (let k = 1; k <= depth; k++) {
    out.push(<span key={k} className="guide" style={{ "--level": k } as CSSProperties} aria-hidden="true" />);
  }
  return <>{out}</>;
}

/** The empty slot a refused record tried to occupy, inside its parent's authority. */
function Ghost({ row }: { row: Row }) {
  const parent = row.kind === "mandate" ? row.mandate.parent_id : row.cap.mandate_id;
  return (
    <div className="ghost" aria-hidden="true">
      {row.kind === "mandate" ? (
        <>
          Tried to sit under <span className="mono">{parent}</span>. Validators kept it out.
        </>
      ) : (
        <>
          Asked to buy under <span className="mono">{parent}</span>. Validators refused it.
        </>
      )}
    </div>
  );
}

export default function Ledger({
  rows,
  store,
  openIds,
  onToggle,
  renderActions,
  canAct,
}: {
  rows: Row[];
  store: Store;
  openIds: Set<string>;
  onToggle(id: string): void;
  renderActions?(row: Row): ReactNode;
  canAct?(row: Row): boolean;
}) {
  return (
    <ol className="ledger">
      {rows.map((row) => {
        const entry =
          row.kind === "mandate" ? (
            <MandateEntry
              row={row}
              store={store}
              open={openIds.has(row.key)}
              onToggle={() => onToggle(row.key)}
              actions={renderActions?.(row)}
              canAct={canAct?.(row) ?? false}
            />
          ) : (
            <SlipEntry
              row={row}
              store={store}
              open={openIds.has(row.key)}
              onToggle={() => onToggle(row.key)}
              actions={renderActions?.(row)}
              canAct={canAct?.(row) ?? false}
            />
          );
        const style = { "--depth": row.depth } as CSSProperties;
        return (
          <li key={row.key} className={`ledger__row ledger__row--${row.lane}`} style={style}>
            <div className="ledger__spine">
              <Guides depth={row.depth} />
              {row.depth > 0 && <span className="elbow" aria-hidden="true" />}
              {row.lane === "spine" ? entry : <Ghost row={row} />}
            </div>
            <div className="ledger__gutter">{row.lane === "gutter" && entry}</div>
            {row.lane === "gutter" && openIds.has(row.key) && (
              <div className="ledger__detail">
                <Guides depth={row.depth} />
                <div className="ledger__panel" id={`more-${row.key}`}>
                  {row.kind === "mandate" ? (
                    <MandateDetail m={row.mandate} store={store} />
                  ) : (
                    <SlipDetail cap={row.cap} store={store} />
                  )}
                  {renderActions && <div className="entry__actions">{renderActions(row)}</div>}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
