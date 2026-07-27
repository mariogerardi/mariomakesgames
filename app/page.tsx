import Link from "next/link";
import { GameCard } from "../src/app-shell/game-card";
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
            <p className="eyebrow">Original games by Mario Gerardi</p>
            <h1>
              Six games.
              <br />
              One place to play.
            </h1>
            <p className="hero-intro">
              A growing collection of word games for the curious, competitive,
              and just-one-more-round crowd.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href={`/games/${flagship.id}`}>
                Meet {flagship.name}
                <span aria-hidden="true">↗</span>
              </Link>
              <a className="text-link" href="#games">
                Browse the collection
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>

          <div className="hero-gallery" aria-hidden="true">
            <div className="hero-orbit hero-orbit-one" />
            <div className="hero-orbit hero-orbit-two" />
            <div className="preview-card preview-card-syllabl">
              <div className="preview-label">SYLLABL</div>
              <div className="syllable-word">
                <span>SYL</span>
                <span>LABL</span>
              </div>
              <div className="preview-rule">
                <span>stage 04</span>
                <span>·</span>
                <span>6 letters</span>
              </div>
            </div>
            <div className="preview-card preview-card-rarity">
              <div className="preview-label">RARITY</div>
              <div className="rarity-string">STR</div>
              <div className="rarity-score">94.08</div>
              <div className="rarity-caption">exceptionally rare</div>
            </div>
            <div className="preview-card preview-card-gridl">
              <div className="preview-label">GRIDL</div>
              <div className="mini-grid">
                <span />
                <span className="filled">CA</span>
                <span />
                <span />
                <span className="path">T</span>
                <span className="goal">★</span>
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>

        <section className="collection page-width" id="games">
          <div className="section-heading">
            <div>
              <p className="eyebrow">The collection</p>
              <h2>Pick your puzzle.</h2>
            </div>
            <p>
              Each game keeps its own rules and rhythm, with one shared home
              around it.
            </p>
          </div>

          <div className="game-grid">
            {hubGames.map((game) => (
              <GameCard game={game} key={game.id} />
            ))}
          </div>
        </section>

        <section className="promise page-width">
          <p className="eyebrow">Built with care</p>
          <div className="promise-grid">
            <h2>The original rules stay the rules.</h2>
            <p>
              Every game is being rebuilt from a tested record of how it plays,
              so a new home never means losing what made it work.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
