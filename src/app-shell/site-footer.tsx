import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer" id="about">
      <div className="page-width footer-inner">
        <div>
          <span className="wordmark-monogram">MG</span>
          <p>Original games by Mario Gerardi.</p>
        </div>
        <div className="footer-note">
          <p>Thoughtful rules. Short sessions. One shared home.</p>
          <Link href="/#games">Choose a game ↑</Link>
        </div>
      </div>
    </footer>
  );
}
