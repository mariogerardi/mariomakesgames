import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
        <section className="game-canvas" aria-label={`${game.name} play area`}>
          <h1 className="game-canvas-title">{game.name}</h1>
          <Link className="game-canvas-back" href="/#games" aria-label="Back to all games">
            <span aria-hidden="true">←</span>
            Games
          </Link>
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
