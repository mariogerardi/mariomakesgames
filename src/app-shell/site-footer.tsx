import Link from "next/link";
import { siteBrand } from "./site-brand";

export function SiteFooter() {
  return (
    <footer className="site-footer" id="about">
      <div className="page-width footer-inner">
        <div>
          <span className="wordmark-monogram" aria-hidden="true">{siteBrand.mark}</span>
          <p>
            <strong className="footer-brand">{siteBrand.name}</strong>
            <span>A collection by {siteBrand.creator}.</span>
          </p>
        </div>
        <div className="footer-note">
          <p>Play a little. Think a lot.</p>
          <Link href="/#games">Pick a game ↑</Link>
        </div>
      </div>
    </footer>
  );
}
