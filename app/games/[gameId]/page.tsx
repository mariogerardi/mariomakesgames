import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameCanvasBack } from "../../../src/app-shell/game-canvas-back";
import { SiteHeader } from "../../../src/app-shell/site-header";
import { GameLoader } from "../../../src/games/game-loader";
import { getHubGame, hubGames } from "../../../src/games/registry";

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
          <GameLoader gameId={game.id} />
        </section>
      </main>
    </div>
  );
}
