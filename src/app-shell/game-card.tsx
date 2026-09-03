import Link from "next/link";
import type { HubDisplayGame } from "../games/hub-registry";
import { GameMark } from "./game-mark";

export function GameCard({ game }: { game: HubDisplayGame }) {
  const isComingSoon = game.hubStatus === "coming-soon";
  const Wordmark = game.presentation.Wordmark;
  const content = (
    <>
      <div className="card-topline">
        <GameMark game={game} />
        {isComingSoon && <span className="coming-soon-badge">coming soon!</span>}
      </div>
      <div className="card-copy">
        <p>{game.eyebrow}</p>
        <Wordmark />
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
