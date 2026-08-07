import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <Link className="wordmark" href="/" aria-label="Games home">
          <span className="wordmark-monogram">MG</span>
          <span className="wordmark-name">Games</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/#games">All games</Link>
          <Link href="/#about">About</Link>
        </nav>
      </div>
    </header>
  );
}
