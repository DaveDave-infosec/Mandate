import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import { REPO_URL } from "../lib/contracts";

const STEPS = [
  {
    title: "A human issues the root",
    body: "The principal writes the mandate in plain words and sets structured caveats: a spend cap, an expiry, allowed categories and allowed vendors. The principal can fund it in escrow. The human's own words need no judgment, so the root is active at once.",
    code: "issue_root, fund_root",
  },
  {
    title: "Agents delegate narrower mandates",
    body: "The holder of a mandate can hand part of it to another agent, up to three hops below the human. Code checks the caveats first: cap, expiry, categories, vendors, depth and loops. If the text is identical to the parent, it is approved by hash with no validator call. If the text changed, validators read the whole chain from the root down and answer narrower, widens or unclear.",
    code: "delegate",
  },
  {
    title: "Agents ask to buy a catalog item",
    body: "An agent names an item id. Vendors write those listings on-chain and can never edit them. Code checks category, vendor and price at every hop. Validators then judge whether the vendor's listing fits every mandate in the chain. A repeat request for an item already authorized under the same mandate issues by precedent, with no validator call.",
    code: "request_capability",
  },
  {
    title: "The market pays, once",
    body: "An authorized request becomes a single-use capability. At payment time the market re-reads the chain, checks that every hop is still active and unexpired, checks each hop's budget, and pays the vendor from the root's escrow. Any failure reverts with nothing moved.",
    code: "purchase",
  },
  {
    title: "Anyone resolves a held record, grantors revoke",
    body: "An unclear verdict holds the record. Any wallet can force one final review, which must decide; unresolved means refused. A grantor can revoke at any time, and every descendant dies by chain walk. The principal reclaims unspent escrow afterwards.",
    code: "escalate, escalate_capability, revoke, refund_root",
  },
];

export default function HowItWorks() {
  return (
    <>
      <main className="doc">
        <header className="doc__head">
          <h1 className="doc__title">How it works</h1>
          <p className="doc__lede">
            Two contracts on GenLayer Studio. The registry holds mandates, the catalog and purchase requests. The market
            holds the GEN ledger and only reads the registry. Neither has an owner.
          </p>
        </header>

        <ol className="pipeline">
          {STEPS.map((s, i) => (
            <li key={s.title} className="pipeline__step">
              <span className="pipeline__n mono">{i + 1}</span>
              <div>
                <h2>{s.title}</h2>
                <p>{s.body}</p>
                <p className="pipeline__code">
                  <span className="mono">{s.code}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>

        <section className="doc__section">
          <h2>How the validators are asked</h2>
          <ul className="doc__list">
            <li>Each prompt carries every mandate in the chain, root first, so drift from the human's words is caught even two hops down.</li>
            <li>Mandate and listing text is passed as quoted data. The quoting markers are stripped from the text itself, so no one can forge them.</li>
            <li>Restrictions are inherited. A child that leaves a restriction out has not widened anything; a child that adds a purpose has.</li>
            <li>Each answer must be JSON with a verdict from a fixed set, the violated clause, the reasoning and the strongest dissent. Anything else reverts.</li>
            <li>An identical delegation, or an item already refused under a mandate, cannot be resubmitted to fish for a different verdict.</li>
          </ul>
        </section>

        <section className="doc__section">
          <h2>Honest limitations</h2>
          <ul className="doc__list">
            <li>V1 judges a purchase against the vendor's listing. It does not check that the vendor delivered.</li>
            <li>Validators can be wrong on genuinely ambiguous wording. That is why unclear verdicts are held and unresolved ones refuse.</li>
            <li>Four fixed categories: infrastructure, software license, data service, marketing. Three hops below the human.</li>
            <li>Time is supplied by the caller and checked against stored expiry. Nothing wakes on its own.</li>
            <li>Only the issuer can mint GEN on this testnet deployment, so funding escrow needs GEN from the issuer.</li>
          </ul>
        </section>

        <section className="doc__section">
          <h2>Check it yourself</h2>
          <p>
            The repository holds both contracts and 62 tests. 51 run the real contract code in-process, including a test
            for every code-decided rule that also proves no validator was consulted. 11 read the deployed contracts and
            assert the live proof run, including that the vault holds exactly the sum of every escrow.
          </p>
          <p className="doc__actions">
            <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">
              Source and tests
            </a>
            <Link className="btn btn--primary" to="/console">
              Open the console
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
