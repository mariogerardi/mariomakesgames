import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../src/app-shell/site-header";
import { GameLoader } from "../../../src/games/game-loader";
import { GameProgressBoundary } from "../../../src/platform/game-progress-provider";
import { getHubGame, hubGames } from "../../../src/games/registry";
import { resolveGameRouteState } from "../../../src/games/route-state";

type GamePageProps = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const [{ gameId }, query] = await Promise.all([params, searchParams]);
  const game = getHubGame(gameId);
  if (!game) notFound();
  const initialRoute = resolveGameRouteState(game.id, query);

  return (
    <div className="site-frame" data-game={game.id}>
      <SiteHeader />
      <main className="game-page">
        <section className="game-canvas" aria-label={`${game.name} play area`}>
          <h1 className="game-canvas-title">{game.name}</h1>
          <GameProgressBoundary gameId={game.id} eagerShell={["syllabl", "rarity", "before-after", "decode", "token", "dual"].includes(game.id)}><GameLoader gameId={game.id} initialRoute={initialRoute} /></GameProgressBoundary>
        </section>
      </main>
    </div>
  );
}
