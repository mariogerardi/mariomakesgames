import type { RarityPuzzle } from "./puzzle-loader.mjs";

export type RarityWordInfo = {
  isValid: boolean;
  frequency: number;
  rarityScore?: number;
  definition: string | null;
  partOfSpeech: string | null;
  shortDefinitions: string[];
  allShortDefinitions: string[];
  allPartsOfSpeech: string[];
  definitionCount: number;
  partOfSpeechCount: number;
  definitionsByPartOfSpeech: Record<string, unknown>;
  usageLabels: string[];
  etymology: unknown[];
  examples: unknown[];
  scoreExplanation: string | null;
  error: string | null;
};
export type RarityServices = {
  validateWord(word: string): Promise<RarityWordInfo>;
  fetchDailyPuzzle(dateKey: string): Promise<RarityPuzzle | null>;
  submitDailyResult(payload: Record<string, unknown>): Promise<boolean>;
  fetchDailyLeaderboard(dateKey: string): Promise<Record<string, unknown>[]>;
};
export function createRarityServices(input: {
  fetcher: typeof fetch;
  wordInfoApi: string;
  puzzleApi: string;
  leaderboardApi: string;
}): RarityServices;
export function summarizeRarityLeaderboard(
  entries: Record<string, unknown>[],
  playerScore: number,
): { total: number; percentile: number | null; bestScore: number | null };
