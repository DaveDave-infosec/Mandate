import { Link, NavLink } from "react-router-dom";
import { REPO_URL } from "../lib/contracts";

function NavLinkClass(isActive: boolean): string {
  return isActive ? "nav__link nav__link--on" : "nav__link";
}

export default function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav__brand">
        <svg className="nav__mark" width="28" height="28" viewBox="122 126 1010 1010" aria-hidden="true">
          <circle cx="627" cy="631" r="455.5" fill="none" stroke="var(--brass)" strokeWidth="34" />
          <polygon points="341.0,352.0 627.0,579.1 913.0,352.0 913.0,573.0 885.0,595.2 885.0,409.2 627.0,614.1 369.0,409.2 369.0,595.2 341.0,573.0" fill="var(--brass)" />
          <polygon points="412.0,567.0 627.0,737.7 842.0,567.0 842.0,745.0 814.0,767.2 814.0,624.2 627.0,772.7 440.0,624.2 440.0,767.2 412.0,745.0" fill="var(--brass)" />
          <polygon points="482.0,747.0 627.0,862.1 772.0,747.0 772.0,873.0 744.0,895.2 744.0,804.2 627.0,897.1 510.0,804.2 510.0,895.2 482.0,873.0" fill="var(--brass)" />
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
