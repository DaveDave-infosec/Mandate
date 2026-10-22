import { useState } from "react";
import { V1_RECORD } from "../lib/store";
import { RECEIPTS, txUrl } from "../lib/contracts";

/**
 * The headline of the live proof run, replayed from real records:
 * the human's root, a narrower delegation, a widening ejected by validators,
 * and the purchase that stayed inside every mandate.
 */
export default function HeroStory() {
  const store = V1_RECORD;
  const [run, setRun] = useState(0);
  const root = store.mandates["m_0"];
  const narrow = store.mandates["m_1"];
  const widen = store.mandates["m_2"];
  const paid = store.capabilities["c_1"];
  const item = paid ? store.items[paid.item_id] : undefined;
  if (!root || !narrow || !widen) return null;

  return (
    <figure className="story" aria-label="Replay of the live proof run" key={run}>
      <figcaption className="story__cap">
        From the live run on GenLayer Studio. Every line below is an on-chain record.
      </figcaption>

      <div className="story__row story__row--root" style={{ animationDelay: "0ms" }}>
        <span className="story__who">The human, to Agent A</span>
        <p className="story__text">{root.text}</p>
      </div>

      <div className="story__row story__row--ok" style={{ animationDelay: "700ms" }}>
        <span className="story__who">Agent A, to Agent B</span>
        <p className="story__text">{narrow.text}</p>
        <span className="story__verdict story__verdict--ok">Validators: narrower. Kept.</span>
      </div>

      <div className="story__row story__row--bad" style={{ animationDelay: "1500ms" }}>
        <span className="story__rule" aria-hidden="true" style={{ animationDelay: "2300ms" }} />
        <div className="story__ejected">
          <span className="story__who">Agent B, to Agent C</span>
          <p className="story__text">{widen.text}</p>
          <span className="story__verdict story__verdict--bad">
            Validators: widens. Ejected for breaking “{widen.violated_restriction.replace(/\.$/, "")}”, written two hops up.
          </span>
        </div>
      </div>

      {paid && item && (
        <div className="story__row story__row--paid" style={{ animationDelay: "3000ms" }}>
          <span className="story__who">Agent C buys, inside every mandate</span>
          <p className="story__item">
            {item.title}, {paid.price} GEN, paid from the human's escrow
          </p>
        </div>
      )}

      <div className="story__foot">
        <a className="receipt" href={txUrl(RECEIPTS.widening)} target="_blank" rel="noreferrer">
          The refusal on the explorer
        </a>
        <button type="button" className="link-btn" onClick={() => setRun((n) => n + 1)}>
          Replay
        </button>
      </div>
    </figure>
  );
}
