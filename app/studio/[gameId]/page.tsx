import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../src/app-shell/site-header";
import { isLocalStudioHost } from "../../../src/authoring/studio-access";
import { isAuthorableGameId, STUDIO_GAME_BY_ID } from "../../../src/authoring/studio-games";
import { PuzzleStudio } from "../../../src/authoring/puzzle-studio";
import "../../styles/studio.css";

export const metadata: Metadata = {
  title: "Game Workspace · Puzzle Studio",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return Object.keys(STUDIO_GAME_BY_ID).map((gameId) => ({ gameId }));
}

export default async function StudioGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const { gameId } = await params;
  if (process.env.NODE_ENV !== "development" || !isLocalStudioHost(host) || !isAuthorableGameId(gameId)) notFound();

  return (
    <div className="site-frame studio-site-frame">
      <SiteHeader />
      <PuzzleStudio gameId={gameId} key={gameId} />
    </div>
  );
}
