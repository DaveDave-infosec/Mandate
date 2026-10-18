import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { getVendorName, type Capability, type Mandate } from "../../lib/mandate";
import type { Store } from "../../lib/store";
import { CATEGORIES, ISSUER, txUrl } from "../../lib/contracts";
import { SLOT_LABELS, useWallet } from "../../lib/wallet";
import { chainOf, effectiveState } from "../../lib/tree";
import {
  delegate,
  escalate,
  escalateCapability,
  fundRoot,
  issueRoot,
  listItem,
  mint,
  purchase,
  refundRoot,
  registerVendor,
  requestCapability,
  revoke,
} from "../../lib/writes";
import { useAction, type ActionState } from "./useAction";
import Who from "../Who";

const MAX_DEPTH = 3;
const MAX_TEXT = 2000;
const DAY = 86_400;

export type DoneHandler = (newId?: string) => void;

/* ---------------------------------------------------------------- helpers */

function isAddr(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

function csv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function toDateInput(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function fromDateInput(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor(Date.UTC(y, m - 1, d, 23, 59, 59) / 1000);
}

function label(c: string): string {
  return c.replace("_", " ");
}

/* ---------------------------------------------------------------- status */

export function ActionStatus({ state }: { state: ActionState }) {
  if (state.phase === "idle") return null;
  if (state.phase === "working") {
    return (
      <p className="act-status act-status--working" role="status">
        Confirm in your wallet if it asks. Validators then run and the transaction must finalize, usually within two
        minutes. {state.elapsed > 0 && <span className="mono">{state.elapsed}s</span>}
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <p className="act-status act-status--error" role="alert">
        The chain refused it: {state.message}
      </p>
    );
  }
  return (
    <p className="act-status act-status--done" role="status">
      {state.message}{" "}
      {state.hash && (
        <a className="receipt" href={txUrl(state.hash)} target="_blank" rel="noreferrer">
          Transaction on the explorer
        </a>
      )}
    </p>
  );
}

function Field({ label: text, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{text}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** Choose a session wallet as the recipient, or paste any address. */
function AddressField({
  value,
  onChange,
  text,
  exclude,
}: {
  value: string;
  onChange(v: string): void;
  text: string;
  exclude: string[];
}) {
  const { wallets, active, createWallet } = useWallet();
  const options = wallets.filter(
    (w) => !exclude.includes(w.address.toLowerCase()) && w.address.toLowerCase() !== active?.address.toLowerCase()
  );
  const freeSlot = SLOT_LABELS.find((l) => !wallets.some((w) => w.label === l));
  const listId = useId();
  return (
    <Field label={text} hint="Pick one of your session wallets, or paste any address.">
      <input
        className="input mono"
        list={listId}
        value={value}
        placeholder="0x..."
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((w) => (
          <option key={w.address} value={w.address}>
            {w.label}
          </option>
        ))}
      </datalist>
      <span className="field__picks">
        {options.map((w) => (
          <button
            key={w.address}
            type="button"
            className={"chip" + (value.toLowerCase() === w.address.toLowerCase() ? " chip--on" : "")}
            onClick={() => onChange(w.address)}
          >
            {w.label}
          </button>
        ))}
        {freeSlot && (
          <button type="button" className="chip chip--create" onClick={() => onChange(createWallet(freeSlot, false))}>
            Create {freeSlot} for them
          </button>
        )}
      </span>
    </Field>
  );
}

function Checks({
  all,
  chosen,
  onChange,
  render,
}: {
  all: string[];
  chosen: string[];
  onChange(v: string[]): void;
  render?(v: string): ReactNode;
}) {
  return (
    <span className="checks">
      {all.map((v) => {
        const on = chosen.includes(v);
        return (
          <label key={v} className={"check" + (on ? " check--on" : "")}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? chosen.filter((x) => x !== v) : [...chosen, v])}
            />
            {render ? render(v) : label(v)}
          </label>
        );
      })}
    </span>
  );
}

/* ---------------------------------------------------------------- mandate form (root and delegation) */

interface MandateDraftLimits {
  parent?: Mandate;
  vendorNames: Record<string, string>;
}

function MandateForm({
  limits,
  submitLabel,
  exclude,
  onSubmit,
  busy,
}: {
  limits: MandateDraftLimits;
  submitLabel: string;
  exclude: string[];
  busy: boolean;
  onSubmit(d: { grantee: string; text: string; cap: number; expiry: number; categories: string; vendors: string }): void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const parent = limits.parent;
  const parentCats = parent ? csv(parent.categories) : [...CATEGORIES];
  const parentVendors = parent && parent.vendors !== "*" ? csv(parent.vendors) : null;
  const maxExpiry = parent ? Number(parent.expiry) : now + 365 * DAY;
  const knownVendors = Object.keys(limits.vendorNames);

  const [grantee, setGrantee] = useState("");
  const [text, setText] = useState(parent ? parent.text : "");
  const [cap, setCap] = useState(parent ? parent.cap : "5");
  const [expiry, setExpiry] = useState(toDateInput(Math.min(now + 30 * DAY, maxExpiry)));
  const [cats, setCats] = useState<string[]>(parentCats);
  const [anyVendor, setAnyVendor] = useState(parentVendors === null);
  const [vendors, setVendors] = useState<string[]>(parentVendors ?? []);
  const [problem, setProblem] = useState("");

  const sameText = parent !== undefined && text.trim() === parent.text;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g = grantee.trim();
    const t = text.trim();
    const c = Number(cap);
    const exp = fromDateInput(expiry);
    if (!isAddr(g)) return setProblem("Enter a full 0x address for who receives this mandate.");
    if (exclude.includes(g.toLowerCase())) return setProblem("That address is already part of this chain.");
    if (t === "") return setProblem("Write the mandate in plain words.");
    if (t.length > MAX_TEXT) return setProblem(`Keep the mandate under ${MAX_TEXT} characters.`);
    if (!Number.isInteger(c) || c <= 0) return setProblem("The spend cap must be a whole number above zero.");
    if (parent && c > Number(parent.cap)) return setProblem(`The cap cannot exceed the parent's ${parent.cap} GEN.`);
    if (exp <= now) return setProblem("Pick an expiry date in the future.");
    if (exp > maxExpiry) return setProblem("The expiry cannot be later than the parent's.");
    if (cats.length === 0) return setProblem("Allow at least one category.");
    if (!anyVendor && vendors.length === 0) return setProblem("Allow at least one vendor, or any vendor.");
    setProblem("");
    onSubmit({
      grantee: g,
      text: t,
      cap: c,
      expiry: Math.min(exp, maxExpiry),
      categories: cats.join(","),
      vendors: anyVendor ? "*" : vendors.join(","),
    });
  };

  return (
    <form className="act-form" onSubmit={submit}>
      <AddressField text="Granted to" value={grantee} onChange={setGrantee} exclude={exclude} />
      <Field
        label="Mandate, in plain words"
        hint={
          parent
            ? sameText
              ? "Unchanged text is approved by hash, with no validator call. Narrow it with the caveats below."
              : "Changed text goes to validators, who read the whole chain above it."
            : "This is what every later delegation must stay inside."
        }
      >
        <textarea className="input input--text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="act-form__pair">
        <Field label="Spend cap, GEN" hint={parent ? `At most ${parent.cap}` : undefined}>
          <input
            className="input mono"
            type="number"
            min={1}
            max={parent ? Number(parent.cap) : undefined}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </Field>
        <Field label="Expires" hint={parent ? `No later than ${toDateInput(maxExpiry)}` : undefined}>
          <input
            className="input mono"
            type="date"
            value={expiry}
            max={toDateInput(maxExpiry)}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Allowed categories">
        <Checks all={parentCats} chosen={cats} onChange={setCats} />
      </Field>
      <Field label="Allowed vendors">
        <span className="checks">
          {parentVendors === null && (
            <label className={"check" + (anyVendor ? " check--on" : "")}>
              <input type="checkbox" checked={anyVendor} onChange={() => setAnyVendor(!anyVendor)} />
              any vendor
            </label>
          )}
        </span>
        {!anyVendor && (
          <Checks
            all={parentVendors ?? knownVendors}
            chosen={vendors}
            onChange={setVendors}
            render={(v) => <Who addr={v} names={limits.vendorNames} />}
          />
        )}
      </Field>
      {problem !== "" && <p className="act-status act-status--error">{problem}</p>}
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- availability */

export interface Availability {
  delegate: boolean;
  request: boolean;
  revoke: boolean;
  escalate: boolean;
  fund: boolean;
  refund: boolean;
}

export function mandateAvailability(m: Mandate, me: string, store: Store, now: number): Availability {
  const live = effectiveState(m, store.mandates, now) === "ACTIVE";
  const isRoot = m.parent_id === "";
  const grantee = me !== "" && me === m.grantee.toLowerCase();
  const grantor = me !== "" && me === m.grantor.toLowerCase();
  const expired = Number(m.expiry) < now;
  return {
    delegate: live && grantee && Number(m.depth) < MAX_DEPTH,
    request: live && grantee,
    revoke: grantor && (m.status === "ACTIVE" || m.status === "HELD"),
    escalate: me !== "" && m.status === "HELD" && m.escalated === "0",
    fund: isRoot && grantor && m.status === "ACTIVE" && !expired,
    refund: isRoot && grantor && (m.status === "REVOKED" || expired) && (store.escrow[m.id] ?? 0) > 0,
  };
}

export function slipAvailability(cap: Capability, me: string, store: Store, now: number) {
  const m = store.mandates[cap.mandate_id];
  const live = m ? effectiveState(m, store.mandates, now) === "ACTIVE" : false;
  return {
    purchase:
      me !== "" &&
      me === cap.grantee.toLowerCase() &&
      cap.status === "ISSUED" &&
      !store.purchases[cap.id] &&
      live,
    escalate: me !== "" && cap.status === "HELD" && cap.escalated === "0",
  };
}

/* ---------------------------------------------------------------- request a purchase */

function gateFor(itemId: string, chain: Mandate[], store: Store, mandateId: string): string {
  const it = store.items[itemId];
  if (!it) return "unknown item";
  const vendor = it.vendor.toLowerCase();
  for (const hop of chain) {
    if (!csv(hop.categories).includes(it.category)) return `${label(it.category)} is not allowed by ${hop.id}`;
    if (hop.vendors !== "*" && !csv(hop.vendors).includes(vendor)) return `this vendor is not allowed by ${hop.id}`;
    if (Number(it.price) > Number(hop.cap)) return `price is above the cap of ${hop.id}`;
  }
  for (const c of Object.values(store.capabilities)) {
    if (c.mandate_id !== mandateId || c.item_id !== itemId) continue;
    if (c.status === "REFUSED") return "already refused under this mandate";
    if (c.status === "HELD") return "already held under this mandate, force its review instead";
  }
  return "";
}

function RequestForm({ m, store, onDone }: { m: Mandate; store: Store; onDone: DoneHandler }) {
  const act = useAction();
  const chain = useMemo(() => chainOf(m.id, store.mandates), [m.id, store.mandates]);
  const items = Object.values(store.items);
  const [pick, setPick] = useState("");
  const precedent = Object.values(store.capabilities).some(
    (c) => c.mandate_id === m.id && c.item_id === pick && c.status === "ISSUED"
  );
  return (
    <div className="act-form">
      <p className="act-form__note">
        Name a catalog item. Validators judge the vendor's own listing against every mandate in the chain. Items that
        fail a code check are blocked here before any validator is asked.
      </p>
      <ul className="pick-list">
        {items.map((it) => {
          const blocked = gateFor(it.id, chain, store, m.id);
          return (
            <li key={it.id}>
              <label className={"pick" + (blocked ? " pick--blocked" : "") + (pick === it.id ? " pick--on" : "")}>
                <input
                  type="radio"
                  name={`req-${m.id}`}
                  disabled={blocked !== ""}
                  checked={pick === it.id}
                  onChange={() => setPick(it.id)}
                />
                <span className="pick__title">{it.title}</span>
                <span className="pick__price mono">{it.price} GEN</span>
                {blocked && <span className="pick__why">Blocked in code: {blocked}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {pick !== "" && precedent && act.state.phase !== "done" && (
        <p className="act-form__note">Already authorized under this mandate, so this issues by precedent.</p>
      )}
      <button
        type="button"
        className="btn btn--primary"
        disabled={pick === "" || act.busy}
        onClick={() =>
          act.run(
            () => requestCapability(m.id, pick),
            (r) => {
              setPick("");
              onDone(r.id);
            },
            (r) => `Request ${r.id} recorded. Its verdict is shown below.`
          )
        }
      >
        Ask validators to authorize it
      </button>
      <ActionStatus state={act.state} />
    </div>
  );
}

/* ---------------------------------------------------------------- per-mandate actions */

type Panel = "" | "delegate" | "request" | "fund";

export function MandateActions({
  m,
  store,
  now,
  onDone,
}: {
  m: Mandate;
  store: Store;
  now: number;
  onDone: DoneHandler;
}) {
  const { active } = useWallet();
  const me = active ? active.address.toLowerCase() : "";
  const can = mandateAvailability(m, me, store, now);
  const [panel, setPanel] = useState<Panel>("");
  const act = useAction();
  const [amount, setAmount] = useState("5");
  const chainMembers = useMemo(
    () => chainOf(m.id, store.mandates).flatMap((h) => [h.grantor.toLowerCase(), h.grantee.toLowerCase()]),
    [m.id, store.mandates]
  );

  if (!active) {
    return <p className="act-hint">Pick a wallet above to act on this mandate.</p>;
  }
  const any = Object.values(can).some(Boolean);
  if (!any && (m.status === "REFUSED" || m.status === "REVOKED")) return null;
  if (!any) {
    return (
      <p className="act-hint">
        Nothing for <Who addr={active.address} /> to do here. Only its grantee can delegate or buy, and only its
        grantor can revoke.
      </p>
    );
  }

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? "" : p));

  return (
    <section className="act" aria-label="Actions">
      <h4 className="act__title">
        Act as <Who addr={active.address} />
      </h4>
      <div className="act__buttons">
        {can.delegate && (
          <button type="button" className={"btn" + (panel === "delegate" ? " btn--on" : "")} onClick={() => toggle("delegate")}>
            Delegate part of it
          </button>
        )}
        {can.request && (
          <button type="button" className={"btn" + (panel === "request" ? " btn--on" : "")} onClick={() => toggle("request")}>
            Request a purchase
          </button>
        )}
        {can.fund && (
          <button type="button" className={"btn" + (panel === "fund" ? " btn--on" : "")} onClick={() => toggle("fund")}>
            Fund escrow
          </button>
        )}
        {can.escalate && (
          <button
            type="button"
            className="btn"
            disabled={act.busy}
            onClick={() =>
              act.run(
                () => escalate(m.id),
                () => onDone(m.id),
                () => "Forced review recorded. The verdict is in the record above."
              )
            }
          >
            Force the final review
          </button>
        )}
        {can.refund && (
          <button
            type="button"
            className="btn"
            disabled={act.busy}
            onClick={() => act.run(() => refundRoot(m.id), () => onDone(m.id), () => "Unspent escrow returned to you.")}
          >
            Reclaim unspent escrow
          </button>
        )}
        {can.revoke && (
          <button
            type="button"
            className="btn btn--danger"
            disabled={act.busy}
            onClick={() => {
              if (!window.confirm(`Revoke ${m.id}? Every mandate below it dies with it. This cannot be undone.`)) return;
              act.run(() => revoke(m.id), () => onDone(m.id), () => `${m.id} revoked. Everything below it is now dead.`);
            }}
          >
            Revoke
          </button>
        )}
      </div>
      <ActionStatus state={act.state} />

      {panel === "delegate" && (
        <DelegatePanel m={m} store={store} exclude={chainMembers} onDone={onDone} />
      )}
      {panel === "request" && <RequestForm m={m} store={store} onDone={onDone} />}
      {panel === "fund" && (
        <form
          className="act-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (!Number.isInteger(n) || n <= 0) return;
            act.run(() => fundRoot(m.id, n), () => onDone(m.id), () => `${n} GEN moved into this root's escrow.`);
          }}
        >
          <Field label="Amount, GEN" hint="Moves GEN from your market balance into this root's escrow.">
            <input className="input mono" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn--primary" disabled={act.busy}>
            Fund escrow
          </button>
        </form>
      )}
    </section>
  );
}

function DelegatePanel({
  m,
  store,
  exclude,
  onDone,
}: {
  m: Mandate;
  store: Store;
  exclude: string[];
  onDone: DoneHandler;
}) {
  const act = useAction();
  return (
    <>
      <MandateForm
        limits={{ parent: m, vendorNames: store.vendorNames }}
        submitLabel="Send to validators"
        exclude={exclude}
        busy={act.busy}
        onSubmit={(d) =>
          act.run(
            () => delegate(m.id, d.grantee, d.text, d.cap, d.expiry, d.categories, d.vendors),
            (r) => onDone(r.id),
            (r) => `Delegation ${r.id} recorded. Its verdict is shown in the ledger.`
          )
        }
      />
      <ActionStatus state={act.state} />
    </>
  );
}

/* ---------------------------------------------------------------- per-slip actions */

export function SlipActions({
  cap,
  store,
  now,
  onDone,
}: {
  cap: Capability;
  store: Store;
  now: number;
  onDone: DoneHandler;
}) {
  const { active } = useWallet();
  const me = active ? active.address.toLowerCase() : "";
  const can = slipAvailability(cap, me, store, now);
  const act = useAction();
  if (!active || (!can.purchase && !can.escalate)) return null;
  return (
    <section className="act" aria-label="Actions">
      <h4 className="act__title">
        Act as <Who addr={active.address} />
      </h4>
      <div className="act__buttons">
        {can.purchase && (
          <button
            type="button"
            className="btn btn--primary"
            disabled={act.busy}
            onClick={() =>
              act.run(
                () => purchase(cap.id),
                () => onDone(cap.id),
                (r) => `Purchased as ${r.id}. The vendor was paid from the root's escrow.`
              )
            }
          >
            Buy it now
          </button>
        )}
        {can.escalate && (
          <button
            type="button"
            className="btn"
            disabled={act.busy}
            onClick={() =>
              act.run(() => escalateCapability(cap.id), () => onDone(cap.id), () => "Forced review recorded.")
            }
          >
            Force the final review
          </button>
        )}
      </div>
      {can.purchase && (
        <p className="act-hint">
          The market checks the whole chain again and the budget at every hop before paying. A capability works once.
        </p>
      )}
      <ActionStatus state={act.state} />
    </section>
  );
}

/* ---------------------------------------------------------------- start a chain */

export function IssueRootPanel({ store, onDone }: { store: Store; onDone: DoneHandler }) {
  const { active } = useWallet();
  const [open, setOpen] = useState(false);
  const act = useAction();
  return (
    <section className="start">
      <div className="start__row">
        <p className="start__lede">
          Start your own chain. You write the root mandate and every delegation below it must fit inside your words.
        </p>
        <button type="button" className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Close" : "Issue a root mandate"}
        </button>
      </div>
      {open &&
        (active ? (
          <div className="start__form">
            <MandateForm
              limits={{ vendorNames: store.vendorNames }}
              submitLabel="Issue root mandate"
              exclude={[active.address.toLowerCase()]}
              busy={act.busy}
              onSubmit={(d) =>
                act.run(
                  () => issueRoot(d.grantee, d.text, d.cap, d.expiry, d.categories, d.vendors),
                  (r) => {
                    setOpen(false);
                    onDone(r.id);
                  },
                  (r) => `Root ${r.id} issued. It is open in the ledger.`
                )
              }
            />
            <ActionStatus state={act.state} />
          </div>
        ) : (
          <p className="act-hint">Pick or create a wallet above first. That wallet becomes the principal.</p>
        ))}
      {!open && <ActionStatus state={act.state} />}
    </section>
  );
}

/* ---------------------------------------------------------------- vendors */

export function VendorPanel({ store, onDone }: { store: Store; onDone: DoneHandler }) {
  const { active } = useWallet();
  const act = useAction();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("1");
  const me = active ? active.address.toLowerCase() : "";
  // Vendor names in the store only cover vendors with listings, so ask the chain directly.
  const [chainName, setChainName] = useState<{ addr: string; name: string } | null>(null);
  useEffect(() => {
    if (me === "") return;
    let cancelled = false;
    getVendorName(me)
      .then((name) => {
        if (!cancelled) setChainName({ addr: me, name });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [me]);
  if (!active) return <p className="act-hint">Pick a wallet above to register as a vendor and list items.</p>;
  const knownName = store.vendorNames[me] ?? (chainName?.addr === me ? chainName.name : "");
  const registered = knownName !== "";
  if (!registered && chainName?.addr !== me) {
    return <p className="act-hint">Checking whether this wallet is a registered vendor...</p>;
  }

  if (!registered) {
    return (
      <form
        className="act-form act-form--inline"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n.length < 1 || n.length > 60) return;
          act.run(
            () => registerVendor(n),
            () => {
              setChainName({ addr: me, name: n });
              onDone();
            },
            () => `Registered as ${n}. You can list items now.`
          );
        }}
      >
        <Field label="Register as a vendor" hint="1 to 60 characters. Buyers see this name next to your listings.">
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={act.busy || name.trim() === ""}>
          Register
        </button>
        <ActionStatus state={act.state} />
      </form>
    );
  }

  return (
    <form
      className="act-form"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(price);
        if (title.trim() === "" || description.trim() === "" || !Number.isInteger(n) || n <= 0) return;
        act.run(
          () => listItem(category, title.trim(), description.trim(), n),
          (r) => onDone(r.id),
          (r) => `Listed as ${r.id}. Listings can never be edited.`
        );
      }}
    >
      <p className="act-form__note">
        Listing as <span className="who">{knownName}</span>. A listing is permanent, and validators judge purchases
        against exactly these words.
      </p>
      <div className="act-form__pair">
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price, GEN">
          <input className="input mono" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <Field label="Title">
        <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" hint="Say plainly what the buyer gets.">
        <textarea
          className="input input--text"
          rows={3}
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <button type="submit" className="btn btn--primary" disabled={act.busy}>
        List item
      </button>
      <ActionStatus state={act.state} />
    </form>
  );
}

/* ---------------------------------------------------------------- issuer */

export function MintPanel({ onDone }: { onDone: DoneHandler }) {
  const { active } = useWallet();
  const act = useAction();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("10");
  if (!active || active.address.toLowerCase() !== ISSUER) return null;
  return (
    <form
      className="act-form act-form--inline"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(amount);
        if (!isAddr(to) || !Number.isInteger(n) || n <= 0) return;
        act.run(() => mint(to.trim(), n), () => onDone(), () => `Minted ${n} GEN.`);
      }}
    >
      <AddressField text="You are the issuer. Mint GEN to" value={to} onChange={setTo} exclude={[]} />
      <Field label="Amount">
        <input className="input mono" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <button type="submit" className="btn" disabled={act.busy}>
        Mint
      </button>
      <ActionStatus state={act.state} />
    </form>
  );
}
