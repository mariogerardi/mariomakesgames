import Link from "next/link";
import type { HubGame } from "../games/registry";
import { GameMark } from "./game-mark";

export function GameCard({ game }: { game: HubGame }) {
  const isComingSoon =
    game.id === "expl41n" || game.id === "decode" || game.id === "gridl";
  const content = (
    <>
      <div className="card-topline">
        <GameMark game={game} />
        {isComingSoon && <span className="coming-soon-badge">coming soon!</span>}
      </div>
      <div className="card-copy">
        <p>{game.eyebrow}</p>
        {game.id === "syllabl" ? (
          <h3 className="syllabl-card-wordmark" aria-label="syllabl">
            <span>sy</span><i aria-hidden="true">·</i><b>lla</b><i aria-hidden="true">·</i><span>bl</span>
          </h3>
        ) : game.id === "rarity" ? (
          <h3 className="rarity-card-wordmark">rarity</h3>
        ) : game.id === "gridl" ? (
          <h3 className="gridl-card-wordmark">gridl</h3>
        ) : game.id === "expl41n" ? (
          <h3 className="expl41n-card-wordmark">Expl<span>41</span>n</h3>
        ) : game.id === "before-after" ? (
          <h3 className="before-after-card-wordmark">
            <span>before</span><i>&amp;</i><b>after</b>
          </h3>
        ) : <h3>{game.name}</h3>}
        <span>{game.description}</span>
      </div>
      <div className="card-footer">
        <span>{isComingSoon ? "Locked" : "Play today"}</span>
        {isComingSoon ? (
          <span aria-hidden="true" className="card-lock-icon" />
        ) : (
          <span aria-hidden="true">↗</span>
        )}
      </div>
    </>
  );

  return (
    <article
      className={`game-card${isComingSoon ? " is-coming-soon" : ""}`}
      data-game={game.id}
    >
      {isComingSoon ? (
        <div
          aria-disabled="true"
          aria-label={`${game.name} — coming soon`}
          className="game-card__locked"
          role="group"
        >
          {content}
        </div>
      ) : (
        <Link href={`/games/${game.id}`} aria-label={`Visit ${game.name}`}>
          {content}
        </Link>
      )}
    </article>
  );
}
