import { Link } from "react-router-dom";
import { MARKET_ADDRESS, REGISTRY_ADDRESS, REPO_URL, addressUrl } from "../lib/contracts";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div>
          <p className="footer__brand">Mandate</p>
          <p className="footer__line">Non-expanding authority for agent delegation chains, on GenLayer.</p>
        </div>
        <dl className="footer__contracts">
          <div>
            <dt>Registry, GenLayer Studio</dt>
            <dd>
              <a className="mono" href={addressUrl(REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">
                {REGISTRY_ADDRESS}
              </a>
            </dd>
          </div>
          <div>
            <dt>Market, GenLayer Studio</dt>
            <dd>
              <a className="mono" href={addressUrl(MARKET_ADDRESS)} target="_blank" rel="noreferrer">
                {MARKET_ADDRESS}
              </a>
            </dd>
          </div>
        </dl>
        <nav className="footer__links" aria-label="Footer">
          <Link to="/console">Console</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/guide">Guide</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source and tests
          </a>
        </nav>
      </div>
    </footer>
  );
}
