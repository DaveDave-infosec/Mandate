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
    title: "The market holds the money, and validators read the delivery",
    body: "An authorized request becomes a single-use capability. At purchase the market re-reads the chain, checks every hop is active and unexpired on chain time, charges every hop's budget, and moves the price out of the root's escrow. The price is held, not paid. The vendor then submits one URL and the SHA-256 hash of the file. Validators fetch it once and must agree on the exact bytes, which must match the hash. That content is stored on-chain, and every review reads the stored copy, never the URL again. Validators grade what is actually there: full, most, half or none. A delivery that breaks any restriction in any mandate is none, even when it matches the listing. Unclear is held until anyone forces one final review.",
    code: "purchase, deliver, escalate_delivery",
  },
  {
    title: "The chain gets one voice, then code settles",
    body: "A decided band opens a challenge window. Any wallet in the chain, from the human at the root to the agent that bought, can argue for a lower band, and the vendor can argue for a higher one. One challenge per purchase. Validators re-read the delivery with the challenge as quoted argument and must decide, and that settles the money at once. With no challenge, anyone settles after the window. The vendor gets its band's share, and the rest returns to the root's escrow and to every hop's budget. A missed delivery deadline refunds everything in code.",
    code: "challenge, settle, expire",
  },
  {
    title: "Anyone resolves a held record, grantors revoke",
    body: "An unclear verdict holds the record. Any wallet can force one final review, which must decide; unresolved means refused, and for a delivery it means the vendor is paid nothing. A grantor can revoke at any time, and every descendant dies by chain walk. The principal reclaims unspent escrow afterwards, and money held for an open purchase stays until that purchase settles.",
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
            Mandate V2 runs on two contracts on GenLayer Studio. The registry holds mandates, the catalog and purchase
            requests. The market holds the GEN ledger, holds every price until validators read the delivery, and only reads
            its own registry. Neither has an owner. The V1 pair stays live for its record, on a registry of its own, so no
            two markets ever share a capability, a mandate or a budget.
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
            <li>For a delivery, validators fetch the vendor's URL once and must agree on the exact bytes, which must match the hash the vendor committed to. Nobody describes the delivery to them. Every review reads that stored copy, and each verdict stores a short quote of what was read.</li>
            <li>A challenge is passed as an argument, not evidence. Validators check each claim against the fetched content and give it weight only where the content bears it out.</li>
          </ul>
        </section>

        <section className="doc__section">
          <h2>Honest limitations</h2>
          <ul className="doc__list">
            <li>A delivery is capped at 16000 bytes, so the stored copy and its hash always cover all of it. Larger deliverables would need to be summarised or split.</li>
            <li>Validators can be wrong on genuinely ambiguous wording. That is why unclear verdicts are held, unresolved ones refuse, and an unresolved delivery pays nothing.</li>
            <li>Four fixed categories: infrastructure, software license, data service, marketing. Three hops below the human.</li>
            <li>The market runs every deadline, window and expiry on the transaction's own timestamp. The registry still takes a time from the caller when it records a delegation or a request, and the market re-checks every expiry on chain time before money moves.</li>
            <li>The testnet windows are short so a run fits in one sitting: 20 minutes to deliver, 15 minutes to challenge.</li>
            <li>GEN is a whole-number unit, so a partial band rounds the vendor's share down. Paid plus refunded always equals the price.</li>
            <li>Only the issuer can mint GEN on this testnet deployment, so funding escrow needs GEN from the issuer.</li>
          </ul>
        </section>

        <section className="doc__section">
          <h2>Check it yourself</h2>
          <p>
            The repository holds the registry, both markets and 101 tests. 79 run the real contract code in-process,
            including a test for every code-decided rule that also proves no validator was consulted. 22 read the deployed
            contracts and assert both live proof runs, including that each vault holds exactly what it owes.
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
