import type { CSSProperties, ReactNode } from "react";
import type { Purchase } from "../lib/mandate";
import type { Store } from "../lib/store";
import Who from "./Who";

export const BAND_SHARE: Record<string, number> = { full: 100, most: 75, half: 50, none: 0 };
const BANDS = ["full", "most", "half", "none"] as const;

export function fmtGen(n: number | string): string {
  const v = Number(n);
  return (Number.isFinite(v) ? v.toLocaleString("en-US") : "0") + " GEN";
}

export function fmtTime(seconds: string | number): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (
    new Date(n * 1000).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

/** Seconds until a chain-time deadline, by this browser's clock. The contract enforces the real one. */
export function secondsLeft(deadline: string, now: number): number {
  return Number(deadline) - now;
}

function minutesText(s: number): string {
  if (s <= 0) return "passed";
  const m = Math.ceil(s / 60);
  return m === 1 ? "about 1 minute left" : `about ${m} minutes left`;
}

/** One line under a purchase slip that says where the money is. */
export function PurchaseLine({ p, store, now }: { p: Purchase; store: Store; now: number }) {
  const vendor = <Who addr={p.vendor} names={store.vendorNames} />;
  if (p.market === "v1") {
    return (
      <span className="slip__paid">
        Paid {fmtGen(p.price)} to {vendor} from the root's escrow in the V1 market
        <span className="mono"> {p.id.replace("v1:", "")}</span>
      </span>
    );
  }
  let text: ReactNode;
  switch (p.status) {
    case "AWAITING_DELIVERY":
      text = (
        <>
          Bought. {fmtGen(p.price)} is held until validators read what {vendor} delivers. Deadline{" "}
          {fmtTime(p.deliver_by)}, {minutesText(secondsLeft(p.deliver_by, now))}.
        </>
      );
      break;
    case "HELD":
      text = <>Validators could not grade the delivery. The money stays held until anyone forces a final review.</>;
      break;
    case "JUDGED":
      text = (
        <>
          Validators graded the delivery {p.band.toUpperCase()}. Open to one challenge until {fmtTime(p.challenge_until)},{" "}
          {minutesText(secondsLeft(p.challenge_until, now))}.
        </>
      );
      break;
    case "SETTLED":
      text = (
        <>
          Settled {p.band.toUpperCase()}: {fmtGen(p.paid)} to {vendor}, {fmtGen(p.refunded)} back to the root's escrow.
        </>
      );
      break;
    case "EXPIRED":
      text = <>The vendor missed the deadline. {fmtGen(p.refunded)} went back to the root's escrow, decided in code.</>;
      break;
    default:
      text = <>Purchase {p.status}</>;
  }
  return (
    <span
      className={
        "slip__paid slip__paid--" + p.status.toLowerCase() + (p.status === "SETTLED" && Number(p.paid) === 0 ? " slip__paid--unpaid" : "")
      }
    >
      {text}
      <span className="mono"> {p.id}</span>
    </span>
  );
}

/** The four bands, with the one in force lit. */
function BandScale({ band }: { band: string }) {
  return (
    <div className="bands" role="img" aria-label={`Band ${band}`}>
      {BANDS.map((b) => (
        <span key={b} className={"bands__step" + (b === band ? " bands__step--on" : "")} data-band={b}>
          <span className="bands__name">{b}</span>
          <span className="bands__share mono">{BAND_SHARE[b]}%</span>
        </span>
      ))}
    </div>
  );
}

/** Where the held price went: the vendor's share and the refund, to scale. */
function SplitBar({ paid, refunded }: { paid: number; refunded: number }) {
  const total = paid + refunded;
  if (total <= 0) return null;
  const style = { "--paid": `${(paid / total) * 100}%` } as CSSProperties;
  return (
    <div className="split-bar" style={style}>
      <div className="split-bar__track" aria-hidden="true">
        <span className="split-bar__paid" />
      </div>
      <div className="split-bar__legend">
        <span>
          <i className="split-bar__key split-bar__key--paid" aria-hidden="true" /> {fmtGen(paid)} to the vendor
        </span>
        <span>
          <i className="split-bar__key split-bar__key--refund" aria-hidden="true" /> {fmtGen(refunded)} back to escrow and
          every hop's budget
        </span>
      </div>
    </div>
  );
}

function Review({
  title,
  reasoning,
  dissent,
  evidence,
}: {
  title: ReactNode;
  reasoning: string;
  dissent: string;
  evidence: string;
}) {
  return (
    <div className="verdict">
      <h4 className="verdict__title">{title}</h4>
      {evidence !== "" && (
        <figure className="evidence">
          <figcaption>Quoted by validators from the delivered content</figcaption>
          <blockquote className="mono">{evidence}</blockquote>
        </figure>
      )}
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

/** The full delivery record of a V2 purchase. */
export function DeliveryDetail({ p, store }: { p: Purchase; store: Store }) {
  if (p.market !== "v2") return null;
  const delivered = p.url !== "";
  return (
    <section className="delivery" aria-label="Delivery">
      <h4 className="delivery__title">Delivery</h4>
      <dl className="facts">
        <div>
          <dt>Price held at purchase</dt>
          <dd className="mono">{fmtGen(p.price)}</dd>
        </div>
        <div>
          <dt>Deliver by, chain time</dt>
          <dd>{fmtTime(p.deliver_by)}</dd>
        </div>
        {delivered && (
          <div className="facts__wide">
            <dt>Delivered at this URL, fetched by every validator</dt>
            <dd>
              <a className="delivery__url mono" href={p.url} target="_blank" rel="noreferrer">
                {p.url}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {p.verdict !== "" && (
        <>
          <Review
            title={`First review: validators fetched the delivery and returned ${p.verdict}`}
            reasoning={p.reasoning}
            dissent={p.minority_note}
            evidence={p.evidence}
          />
          {p.verdict === "none" && p.violated_restriction !== "" && (
            <p className="entry__violates">Fails: {p.violated_restriction}</p>
          )}
        </>
      )}

      {p.escalated === "1" && (
        <Review
          title={
            <>
              Forced review by <Who addr={p.escalated_by} /> returned {p.escalation_verdict}
              {p.escalation_verdict === "unresolved" ? ", so the vendor is paid nothing" : ""}
            </>
          }
          reasoning={p.escalation_reasoning}
          dissent={p.escalation_minority_note}
          evidence={p.escalation_evidence}
        />
      )}

      {p.challenged === "1" && (
        <>
          <figure className="challenge">
            <figcaption>
              Challenged by <Who addr={p.challenger} names={store.vendorNames} />,{" "}
              {p.challenger_role === "vendor" ? "the vendor, asking for a higher band" : "a wallet in the mandate chain, asking for a lower band"}
            </figcaption>
            <blockquote>{p.challenge_text}</blockquote>
          </figure>
          <Review
            title={`Challenge review returned ${p.challenge_verdict}${p.challenge_verdict === "unresolved" ? ", so the vendor is paid nothing" : ""}`}
            reasoning={p.challenge_reasoning}
            dissent={p.challenge_minority_note}
            evidence={p.challenge_evidence}
          />
          {p.challenge_violated_restriction !== "" && (
            <p className="entry__violates">Fails: {p.challenge_violated_restriction}</p>
          )}
        </>
      )}

      {p.band !== "" && (
        <div className="delivery__band">
          <span className="delivery__band-label">
            {p.status === "JUDGED" ? "Band in force, open to one challenge" : "Final band"}
          </span>
          <BandScale band={p.band} />
        </div>
      )}

      {(p.status === "SETTLED" || p.status === "EXPIRED") && (
        <div className="delivery__settled">
          <span className="delivery__band-label">
            {p.status === "EXPIRED" ? "Refunded in code after the deadline" : "Settled"}
            {p.settled_by !== "" && (
              <>
                {" "}
                by <Who addr={p.settled_by} names={store.vendorNames} />
              </>
            )}
          </span>
          <SplitBar paid={Number(p.paid)} refunded={Number(p.refunded)} />
        </div>
      )}
    </section>
  );
}
