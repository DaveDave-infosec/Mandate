import { Link, NavLink } from "react-router-dom";
import { REPO_URL } from "../lib/contracts";

function NavLinkClass(isActive: boolean): string {
  return isActive ? "nav__link nav__link--on" : "nav__link";
}

export default function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav__brand">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1" y="1" width="18" height="18" rx="2" fill="none" stroke="var(--brass)" strokeWidth="1.4" strokeOpacity="0.55" />
          <rect x="4.75" y="4.75" width="10.5" height="10.5" rx="1" fill="none" stroke="var(--brass)" strokeWidth="1.3" strokeOpacity="0.8" />
          <rect x="8.5" y="8.5" width="3" height="3" fill="var(--brass)" />
        </svg>
        <span>Mandate</span>
      </Link>
      <div className="nav__links">
        <NavLink to="/how-it-works" className={({ isActive }) => NavLinkClass(isActive)}>
          How it works
        </NavLink>
        <NavLink to="/guide" className={({ isActive }) => NavLinkClass(isActive)}>
          Guide
        </NavLink>
        <NavLink to="/console" className={({ isActive }) => NavLinkClass(isActive)}>
          Console
        </NavLink>
        <a className="nav__link" href={REPO_URL} target="_blank" rel="noreferrer">
          Docs
        </a>
        <Link to="/console" className="nav__cta">
          Open console
        </Link>
      </div>
    </nav>
  );
}
