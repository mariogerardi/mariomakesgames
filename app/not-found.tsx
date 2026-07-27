import Link from "next/link";
import { SiteFooter } from "../src/app-shell/site-footer";
import { SiteHeader } from "../src/app-shell/site-header";

export default function NotFound() {
  return (
    <div className="site-frame">
      <SiteHeader />
      <main className="empty-page page-width">
        <p className="eyebrow">Nothing here yet</p>
        <h1>That puzzle wandered off.</h1>
        <p>Head back to the collection and choose another room.</p>
        <Link className="button button-primary" href="/">
          See all games
          <span aria-hidden="true">↗</span>
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
