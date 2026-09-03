import Link from "next/link";
import type { AuthorableGameId } from "./contracts.mjs";
import { STUDIO_GAMES } from "./studio-games";

export function StudioTopBar({ currentGameId }: { currentGameId?: AuthorableGameId }) {
  const currentGame = STUDIO_GAMES.find((game) => game.id === currentGameId);
  return (
    <header className="studio-top-bar">
      <Link className="studio-top-brand" href="/studio" aria-label="Puzzle Studio dashboard">
        <span aria-hidden="true">PS</span>
        <strong>Puzzle Studio</strong>
      </Link>
      <nav aria-label="Puzzle Studio navigation">
        <Link aria-current={!currentGameId ? "page" : undefined} href="/studio">Dashboard</Link>
        <Link href="/">Hub</Link>
      </nav>
      <details className="studio-game-switcher">
        <summary>{currentGame?.name ?? "Choose a game"}</summary>
        <div>
          {STUDIO_GAMES.map((game) => <Link aria-current={currentGameId === game.id ? "page" : undefined} href={`/studio/${game.id}`} key={game.id}><span>{game.shortName}</span>{game.name}</Link>)}
        </div>
      </details>
    </header>
  );
}
