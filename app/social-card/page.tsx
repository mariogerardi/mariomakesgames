import type { Metadata } from "next";
import "../styles/hub.css";
import "../styles/social-card.css";
import { HeroGamePreviews } from "../../src/app-shell/hero-game-previews";
import { siteBrand } from "../../src/app-shell/site-brand";

export const metadata: Metadata = {
  title: "Social card preview",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SocialCardPage() {
  return (
    <main className="site-frame social-card-render" aria-label={`${siteBrand.name} social card`}>
      <header className="social-card-render__header">
        <h1>{siteBrand.name}</h1>
        <p>Original browser games by {siteBrand.creator}</p>
      </header>
      <section className="social-card-render__games" aria-label="Featured games">
        <HeroGamePreviews />
      </section>
    </main>
  );
}
