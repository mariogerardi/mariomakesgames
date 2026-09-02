import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameCanvasBack } from "../../../src/app-shell/game-canvas-back";
import { SiteHeader } from "../../../src/app-shell/site-header";
import { getHubGame, hubGames } from "../../../src/games/registry";
import { RarityGame } from "../../../src/games/rarity/rarity-game";
import { SyllablGame } from "../../../src/games/syllabl/syllabl-game";
import { GridlGame } from "../../../src/games/gridl/gridl-game";
import { Expl41nGame } from "../../../src/games/expl41n/expl41n-game";
import { BeforeAfterGame } from "../../../src/games/before-after/before-after-game";
import { DecodeGame } from "../../../src/games/decode/decode-game";
import { TokenGame } from "../../../src/games/token/token-game";
import { DualGame } from "../../../src/games/dual/dual-game";

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
    openGraph: {
      title: game.name,
      description: game.description,
      images: [],
    },
    twitter: {
      title: game.name,
      description: game.description,
      images: [],
    },
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
          <GameCanvasBack gameId={game.id} />
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
          ) : game.id === "token" ? (
            <TokenGame />
          ) : game.id === "dual" ? (
            <DualGame />
          ) : null}
        </section>
      </main>
    </div>
  );
}
