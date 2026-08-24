import Link from "next/link";
import { GameCard } from "../src/app-shell/game-card";
import { HeroGamePreviews } from "../src/app-shell/hero-game-previews";
import { SiteFooter } from "../src/app-shell/site-footer";
import { SiteHeader } from "../src/app-shell/site-header";
import { hubGames } from "../src/games/registry";

export default function Home() {
  const flagship = hubGames[0];

  return (
    <div className="site-frame">
      <SiteHeader />
      <main>
        <section className="hero page-width">
          <div className="hero-copy">
            <h1>Challenge yourself<span className="hero-period">.</span></h1>
            <p className="hero-intro">
              Pick a game and see how you do.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href={`/games/${flagship.id}`}>
                Play {flagship.name}
                <span aria-hidden="true">↗</span>
              </Link>
              <a className="text-link" href="#games">
                All games
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>

          <div className="hero-gallery" aria-hidden="true">
            <div className="hero-marquee">
              <HeroGamePreviews duplicated />
            </div>
          </div>
        </section>

        <section className="collection page-width" id="games">
          <div className="section-heading">
            <div>
              <p className="eyebrow">All games</p>
              <h2>Choose your next one.</h2>
            </div>
          </div>

          <div className="game-grid">
            {hubGames.map((game) => (
              <GameCard game={game} key={game.id} />
            ))}
          </div>
        </section>

        <section className="promise page-width">
          <p className="eyebrow">Come back tomorrow</p>
          <div className="promise-grid">
            <h2>There’s always another word.</h2>
            <p>
              Fresh starts. Better scores. New puzzles.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
