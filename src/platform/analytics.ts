import type { GameId } from "../games/types";

export type HubAnalyticsEvent =
  | { name: "game_opened"; gameId: GameId }
  | { name: "game_started"; gameId: GameId; mode?: string }
  | { name: "game_completed"; gameId: GameId; score?: number };

export interface AnalyticsAdapter {
  track(event: HubAnalyticsEvent): void;
}

export const noOpAnalytics: AnalyticsAdapter = {
  track() {},
};
