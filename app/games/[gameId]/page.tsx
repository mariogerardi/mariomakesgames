import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameMark } from "../../../src/app-shell/game-mark";
import { SiteHeader } from "../../../src/app-shell/site-header";
import { getHubGame, hubGames } from "../../../src/games/registry";
import { RarityGame } from "../../../src/games/rarity/rarity-game";
import { SyllablGame } from "../../../src/games/syllabl/syllabl-game";
import { GridlGame } from "../../../src/games/gridl/gridl-game";
import { Expl41nGame } from "../../../src/games/expl41n/expl41n-game";
import { BeforeAfterGame } from "../../../src/games/before-after/before-after-game";
import { DecodeGame } from "../../../src/games/decode/decode-game";

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

  return (
    <div className="site-frame" data-game={game.id}>
      <SiteHeader />
      <main className="game-page">
        <section className="game-route-bar" aria-label={`${game.name} navigation`}>
          <Link className="game-route-back" href="/#games">
            <span aria-hidden="true">←</span>
            Games
          </Link>
          <div className="game-route-identity">
            <GameMark game={game} />
            <div>
              <h1>{game.name}</h1>
              <p>{game.eyebrow}</p>
            </div>
          </div>
          <ul className="game-route-features" aria-label={`${game.name} features`}>
            {game.mechanics.map((mechanic) => (
              <li key={mechanic}>{mechanic}</li>
            ))}
          </ul>
        </section>

        <section className="game-canvas" aria-label={`${game.name} play area`}>
          {game.id === "syllabl" ? (
            <SyllablGame />
          ) : game.id === "rarity" ? (
            <RarityGame />
          ) : game.id === "gridl" ? (
            <GridlGame />
          ) : game.id === "expl41n" ? (
            <Expl41nGame />
          ) : game.id === "before-after" ? (
            <BeforeAfterGame />
          ) : game.id === "decode" ? (
            <DecodeGame />
          ) : null}
        </section>
      </main>
    </div>
  );
}
