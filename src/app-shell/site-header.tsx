import Link from "next/link";
import { siteBrand } from "./site-brand";
import { AccountControl } from "./account-control";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <Link className="wordmark" href="/" aria-label={`${siteBrand.name} home`}>
          <span className="wordmark-monogram" aria-hidden="true">{siteBrand.mark}</span>
          <span className="wordmark-name">{siteBrand.name}</span>
        </Link>
        <div className="header-actions">
          <nav aria-label="Primary navigation">
            <Link href="/#games">All Games</Link>
            <Link href="/#about">About</Link>
          </nav>
          <AccountControl />
        </div>
      </div>
    </header>
  );
}
