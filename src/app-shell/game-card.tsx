import Link from "next/link";
import type { HubGame } from "../games/registry";
import { GameMark } from "./game-mark";

export function GameCard({ game }: { game: HubGame }) {
  return (
    <article className="game-card" data-game={game.id}>
      <Link href={`/games/${game.id}`} aria-label={`Visit ${game.name}`}>
        <div className="card-topline">
          <GameMark game={game} />
          <span className="card-index">
            {String(game.priority).padStart(2, "0")}
          </span>
        </div>
        <div className="card-copy">
          <p>{game.eyebrow}</p>
          <h3>{game.name}</h3>
          <span>{game.description}</span>
        </div>
        <div className="card-footer">
          <span>{game.stage === "playable" ? "Play today" : "Explore"}</span>
          <span aria-hidden="true">↗</span>
        </div>
      </Link>
    </article>
  );
}
