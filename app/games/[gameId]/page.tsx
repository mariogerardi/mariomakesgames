import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameMark } from "../../../src/app-shell/game-mark";
import { SiteFooter } from "../../../src/app-shell/site-footer";
import { SiteHeader } from "../../../src/app-shell/site-header";
import { getHubGame, hubGames } from "../../../src/games/registry";
import { RarityGame } from "../../../src/games/rarity/rarity-game";
import { SyllablGame } from "../../../src/games/syllabl/syllabl-game";

type GamePageProps = {
  params: Promise<{ gameId: string }>;
};

export function generateStaticParams() {
  return hubGames.map((game) => ({ gameId: game.id }));
}

export async function generateMetadata({
  params,
}: GamePageProps): Promise<Metadata> {
  const { gameId } = await params;
  const game = getHubGame(gameId);
  if (!game) return {};
  return {
    title: game.name,
    description: game.description,
  };
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameId } = await params;
  const game = getHubGame(gameId);
  if (!game) notFound();

  const currentIndex = hubGames.findIndex((entry) => entry.id === game.id);
  const nextGame = hubGames[(currentIndex + 1) % hubGames.length];

  return (
    <div className="site-frame" data-game={game.id}>
      <SiteHeader />
      <main>
        <section className="game-room page-width">
          <Link className="back-link" href="/#games">
            <span aria-hidden="true">←</span>
            All games
          </Link>

          <div className="room-grid">
            <div className="room-identity">
              <GameMark game={game} size="large" />
              <p className="eyebrow">{game.eyebrow}</p>
              <h1>{game.name}</h1>
              <p className="room-description">{game.description}</p>
              <ul className="mechanic-list" aria-label={`${game.name} features`}>
                {game.mechanics.map((mechanic) => (
                  <li key={mechanic}>{mechanic}</li>
                ))}
              </ul>
            </div>

            {game.id === "syllabl" ? (
              <SyllablGame />
            ) : game.id === "rarity" ? (
              <RarityGame />
            ) : (
              <div className="room-stage">
                <div className="stage-topline">
                  <span className="status-dot" />
                  A faithful port is queued
                </div>
                <div className="stage-center">
                  <span className="stage-number">
                    {String(game.priority).padStart(2, "0")}
                  </span>
                  <p>This room is being prepared.</p>
                </div>
                <div className="stage-footer">
                  <span>Mechanics locked</span>
                  <span>Internal route ready</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="next-room page-width">
          <p>Next in the collection</p>
          <Link href={`/games/${nextGame.id}`}>
            <span>{nextGame.name}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
