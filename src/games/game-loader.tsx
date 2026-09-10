import type { ComponentType } from "react";
import type { GameId } from "./types";
import { cookies } from "next/headers";
import { GameThemeProvider } from "../platform/game-theme-provider";
import { themeCookieName, validGameTheme } from "../platform/game-theme";
import { DUAL_INTERFACE_LANGUAGE_COOKIE, parseDualInterfaceLanguage, type DualInterfaceLanguage } from "./dual/language.mjs";
import type { GameRouteState } from "./route-state";

export type GameBootstrapProps = {
  initialRoute?: GameRouteState;
  initialLanguage?: DualInterfaceLanguage;
};

const gameLoaders = {
  syllabl: () => import("./syllabl/syllabl-game").then((module) => module.SyllablGame),
  rarity: () => import("./rarity/rarity-game").then((module) => module.RarityGame),
  gridl: () => import("./gridl/gridl-game").then((module) => module.GridlGame),
  expl41n: () => import("./expl41n/expl41n-game").then((module) => module.Expl41nGame),
  "before-after": () => import("./before-after/before-after-game").then((module) => module.BeforeAfterGame),
  decode: () => import("./decode/decode-game").then((module) => module.DecodeGame),
  token: () => import("./token/token-game").then((module) => module.TokenGame),
  dual: () => import("./dual/dual-game").then((module) => module.DualGame),
} satisfies Record<GameId, () => Promise<React.ComponentType>>;

/**
 * Resolve the selected game as part of the server route render. This keeps each
 * game in its own chunk without exposing an empty client-side dynamic boundary
 * on a player's first visit.
 */
export async function GameLoader({ gameId, initialRoute }: { gameId: GameId; initialRoute?: GameRouteState }) {
  const Game = await gameLoaders[gameId]() as ComponentType<GameBootstrapProps>;
  const cookieStore = await cookies();
  const theme = validGameTheme(gameId, cookieStore.get(themeCookieName(gameId))?.value);
  const initialLanguage = gameId === "dual"
    ? parseDualInterfaceLanguage(cookieStore.get(DUAL_INTERFACE_LANGUAGE_COOKIE)?.value)
    : undefined;
  return <GameThemeProvider theme={theme}><Game initialLanguage={initialLanguage} initialRoute={initialRoute} /></GameThemeProvider>;
}
