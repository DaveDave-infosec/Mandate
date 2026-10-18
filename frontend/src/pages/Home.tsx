import { Link } from "react-router-dom";
import { useStore } from "../lib/useStore";
import { RECEIPTS, txUrl } from "../lib/contracts";
import HeroStory from "../components/HeroStory";
import StateBadge from "../components/StateBadge";
import Who from "../components/Who";
import Footer from "../components/Footer";

const CODE_ROWS = [
  "A spend cap never exceeds the one above it",
  "An expiry never outlives the one above it",
  "Categories and vendors only narrow",
  "Three hops below the human, at most",
  "No agent can be delegated back into its own chain",
  "Identical text is approved by hash, with no validator call",
  "Every purchase is re-checked against every hop's budget at payment time",
  "A capability buys once",
];

const VALIDATOR_ROWS = [
  {
    q: "Does this sub-mandate keep every restriction above it?",
    a: "Validators read the whole chain from the human's words down, not only the parent.",
  },
  {
    q: "Does this catalog item fit every mandate in the chain?",
    a: "They judge the vendor's own listing. The agent asking never describes its purchase.",
  },
];

const STATES = [
  { state: "ACTIVE", line: "Inside every mandate above it. Can delegate and buy." },
  { state: "REFUSED", line: "Validators found it widens a mandate above it. Kept on record, never usable." },
  { state: "HELD", line: "Validators could not decide. Unusable until anyone forces a final review." },
  { state: "REVOKED", line: "Pulled by its grantor. Everything below it dies with it." },
  {
    state: "DEAD",
    line: "Its own record still reads ACTIVE, but an ancestor was revoked or expired. Killed by chain walk.",
  },
];

function SplitRecord() {
  const { store } = useStore();
  const m = store.mandates["m_6"];
  if (!m) return null;
  return (
    <article className="split">
      <blockquote className="split__text">{m.text}</blockquote>
      <ol className="split__steps">
        <li>
          <span className="split__label">
            First review <StateBadge state="HELD" />
          </span>
          <p>{m.reasoning}</p>
          <p className="split__dissent">
            <span>Preserved dissent</span>
            {m.minority_note}
          </p>
        </li>
        <li>
          <span className="split__label">
            Forced review by <Who addr={m.escalated_by} />, a wallet with no role <StateBadge state="REFUSED" />
          </span>
          <p>{m.escalation_reasoning}</p>
          <p className="split__dissent">
            <span>Preserved dissent</span>
            {m.escalation_minority_note}
          </p>
        </li>
      </ol>
      <p className="split__out">
        The forcing pass answered unresolved, so authority defaulted to not granted.{" "}
        <a className="receipt" href={txUrl(RECEIPTS.bystanderEscalation)} target="_blank" rel="noreferrer">
          The forced review on the explorer
        </a>
      </p>
    </article>
  );
}

export default function Home() {
  return (
    <>
      <main className="landing">
        <section className="hero">
          <div className="hero__copy">
            <h1 className="hero__title">Your agent cannot give away more power than you gave it.</h1>
            <p className="hero__lede">
              Agents now hire other agents. Mandate checks every hop of that chain against the words a human signed at
              the top. Code checks the numbers. GenLayer validators check the words.
            </p>
            <div className="hero__ctas">
              <Link to="/console" className="btn btn--primary btn--lg">
                Open the console
              </Link>
              <Link to="/how-it-works" className="btn btn--lg">
                How it works
              </Link>
            </div>
          </div>
          <HeroStory />
        </section>

        <section className="band">
          <h2 className="band__title">Three hops later, nobody has read the sub-mandate.</h2>
          <div className="band__cols">
            <p>
              A human tells an agent: buy development infrastructure, up to 5 GEN, no marketing. That agent hands part of
              the job to another, which hands part to a third. Each hop rewrites the instruction in its own words.
            </p>
            <p>
              Capability systems such as UCAN, macaroons and ZCAP already narrow amounts, dates and resource lists. None of
              them can tell whether a plain-language sub-mandate still honours the restrictions above it. Without that
              check, either one operator decides which delegations are valid, or the human's words are simply not
              enforced.
            </p>
          </div>
        </section>

        <section className="band">
          <h2 className="band__title">What code decides, and what validators decide.</h2>
          <div className="boundary">
            <div className="boundary__col">
              <h3>Decided in code, with no validator call</h3>
              <ul>
                {CODE_ROWS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="boundary__col boundary__col--words">
              <h3>Decided by GenLayer validators</h3>
              {VALIDATOR_ROWS.map((r) => (
                <div key={r.q} className="boundary__q">
                  <p className="boundary__question">{r.q}</p>
                  <p>{r.a}</p>
                </div>
              ))}
              <p className="boundary__note">
                Every code row has a test that also proves no validator was asked. The validators are used only where
                reading is required.
              </p>
            </div>
          </div>
        </section>

        <section className="band">
          <h2 className="band__title">Where validators split, the dissent stays on record.</h2>
          <p className="band__lede">
            Each judged record stores the verdict and the strongest argument against it. When validators cannot decide,
            the mandate is held, and anyone can force a final review. An unresolved answer never grants authority.
          </p>
          <SplitRecord />
        </section>

        <section className="band">
          <h2 className="band__title">Five states, one rule: nothing widens.</h2>
          <ul className="states">
            {STATES.map((s) => (
              <li key={s.state} className="states__row">
                <StateBadge state={s.state} />
                <p>{s.line}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="band">
          <h2 className="band__title">No operator, anywhere.</h2>
          <div className="trust">
            <div className="trust__item">
              <h3>Nobody can approve by hand</h3>
              <p>
                There is no setter and no admin, including the deployer. Tests pin the write surface: eight methods on the
                registry, four on the market.
              </p>
            </div>
            <div className="trust__item">
              <h3>Money moves only inside the chain</h3>
              <p>
                At payment time the market re-reads every hop, checks each budget, and pays from the human's escrow. A
                replayed capability was reverted with nothing moved.
              </p>
              <a className="receipt" href={txUrl(RECEIPTS.replay)} target="_blank" rel="noreferrer">
                The replay revert
              </a>
            </div>
            <div className="trust__item">
              <h3>One revoke ends the whole branch</h3>
              <p>
                Revoking never rewrites descendants. They die because every action walks the chain back to the human. A
                request under the revoked chain was reverted in code.
              </p>
              <a className="receipt" href={txUrl(RECEIPTS.revokedRequest)} target="_blank" rel="noreferrer">
                The reverted request
              </a>
            </div>
          </div>
        </section>

        <section className="closing">
          <h2 className="closing__title">Write a mandate and try to break it.</h2>
          <p>
            Create a few session wallets, issue a root in your own words, and delegate it down. Validators judge every
            change of wording against everything above it.
          </p>
          <div className="hero__ctas">
            <Link to="/console" className="btn btn--primary btn--lg">
              Open the console
            </Link>
            <Link to="/guide" className="btn btn--lg">
              Read the five-minute guide
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
