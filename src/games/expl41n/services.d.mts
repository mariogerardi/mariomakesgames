import type { Expl41nGuess } from "./engine.mjs";
export type Expl41nLeaderboardEntry = {
  username: string;
  score: number;
  clue: string;
};
export type Expl41nServices = {
  guess(input: {
    clue: string;
    previousAIGuesses: string[];
    previousClues: string[];
  }): Promise<Expl41nGuess>;
  submitScore(input: {
    username: string;
    score: number;
    clue: string;
  }): Promise<unknown>;
  leaderboard(username: string): Promise<Expl41nLeaderboardEntry[]>;
};
export function createExpl41nServices(options?: {
  fetcher?: typeof fetch;
  guessApi?: string;
  scoreApi?: string;
}): Expl41nServices;
export function normalizeGuess(value: unknown): Expl41nGuess;
