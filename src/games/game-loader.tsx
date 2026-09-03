import type { GameId } from "./types";

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
export async function GameLoader({ gameId }: { gameId: GameId }) {
  const Game = await gameLoaders[gameId]();
  return <Game />;
}
