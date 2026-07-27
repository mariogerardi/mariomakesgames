import type { GameId } from "../games/types";

export type GameCompletionSummary = {
  gameId: GameId;
  gameName: string;
  puzzleKey?: string;
  headline: string;
  detailLines: readonly string[];
  shareGrid?: readonly string[];
};
