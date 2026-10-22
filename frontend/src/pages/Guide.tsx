import { Link } from "react-router-dom";
import Footer from "../components/Footer";

const STEPS = [
  {
    title: "Make wallets for each role",
    body: "In the console, the Act as row creates session wallets: Principal, Agent A, Agent B, Agent C, Vendor and Bystander. They live in this browser only. Click a chip to sign as that role.",
  },
  {
    title: "Issue a root as the Principal",
    body: "Sign as Principal and click Issue a root mandate. Under Granted to, pick Agent A, or create it right there. Write the mandate in your own words, for example: Buy research data for the market report, up to 3 GEN. No advertising.",
  },
  {
    title: "Delegate as Agent A, and try to widen it",
    body: "Sign as Agent A, open the root's card and click Delegate part of it. Keep the text identical and it is approved by hash. Add something the root forbids, like a promoted post, and validators eject it to the right, quoting the clause it broke.",
  },
  {
    title: "List something to buy as a Vendor",
    body: "Sign as Vendor, scroll to Catalog, register a vendor name, then list an item with a plain description. Listings can never be edited, because validators judge purchases against exactly these words.",
  },
  {
    title: "Ask to buy as the agent",
    body: "Sign as the agent holding a live mandate, open its card and click Request a purchase. Items that fail a code check are blocked with the reason. Pick one and validators decide whether the vendor's listing fits every mandate above.",
  },
  {
    title: "Fund and buy",
    body: "Buying needs GEN in the root's escrow, and only the issuer can mint GEN on this deployment. Once the Principal has GEN, it clicks Fund escrow on the root, and the agent clicks Buy it now. The price leaves escrow and is held. Nobody is paid yet.",
  },
  {
    title: "Deliver as the Vendor",
    body: "Sign as Vendor and find the purchase under Deliveries, marked Yours to deliver. Paste one https URL to what you delivered, a raw text or CSV link reads best, then click Compute it from the URL to fill in its SHA-256 hash. Validators fetch it once, check it matches your hash, store it on-chain and grade it full, most, half or none against your listing and every mandate in the chain. You have 20 minutes, and if you miss it anyone can refund the buyer.",
  },
  {
    title: "Challenge it, or let it settle",
    body: "For 15 minutes the band is open to one challenge. Sign as any wallet in the chain to argue for a lower band, or as the Vendor to argue for a higher one. Validators re-read the stored delivery with your words and settle it at once. With no challenge, anyone clicks Settle now after the window, and the split is shown on the record.",
  },
  {
    title: "Pull it all back",
    body: "Sign as the Principal and click Revoke on the root. Every mandate below it turns DEAD by chain walk, and any further request reverts. Reclaim unspent escrow from the same card.",
  },
];

export default function Guide() {
  return (
    <>
      <main className="doc">
        <header className="doc__head">
          <h1 className="doc__title">The guide</h1>
          <p className="doc__lede">
            Run a whole delegation chain yourself, from one browser. Each write waits for GenLayer validators and
            finalization, usually under two minutes, and the console opens the new record when it lands.
          </p>
        </header>
        <ol className="pipeline">
          {STEPS.map((s, i) => (
            <li key={s.title} className="pipeline__step">
              <span className="pipeline__n mono">{i + 1}</span>
              <div>
                <h2>{s.title}</h2>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <section className="doc__section">
          <h2>Prefer to just read?</h2>
          <p>
            The live proof run is already in the console: a refusal against the root's own words, two refusals against a
            middle agent's words, a vendor's ad package refused on its own listing, a paid purchase, a replay that
            reverted, a held mandate resolved by a bystander, and a revocation that killed every branch below it.
          </p>
          <p className="doc__actions">
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
