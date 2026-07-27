import type { RarityPuzzle } from "./puzzle-loader.mjs";

export type RaritySubmission = {
  word: string;
  frequency: number;
  exactScore: number;
  tier: number;
  timestamp: string;
  definition?: string | null;
  partOfSpeech?: string | null;
  shortDefinitions?: string[];
  [key: string]: unknown;
};
export type RaritySession = {
  schemaVersion: 1;
  puzzle: RarityPuzzle;
  puzzleDate: string;
  hasSubmitted: boolean;
  submission: RaritySubmission | null;
};
export const RARITY_TIER_LABELS: Readonly<Record<number, string>>;
export function calculateRarityScore(frequency: number): {
  rarity: number;
  score: number;
};
export function determineRarityTier(score: number): number;
export function validateRarityLocalRules(
  word: string,
  puzzleString: string,
): { valid: boolean; reason: string | null };
export function createRaritySession(input: {
  puzzle: RarityPuzzle;
  puzzleDate: string;
}): RaritySession;
export function evaluateRarityAttempt(input: {
  state: RaritySession;
  puzzleString: string;
  word: string;
  wordInfo?: Record<string, unknown>;
  timestamp?: string;
}):
  | {
      accepted: true;
      reason: null;
      submission: RaritySubmission;
      state: RaritySession;
    }
  | {
      accepted: false;
      reason: string;
      submission: null;
      state: RaritySession;
    };
export function serializeRaritySubmission(
  puzzleString: string,
  submission: RaritySubmission,
): Record<string, unknown>;
export function hydrateRaritySession(input: {
  payload: Record<string, unknown> | null;
  puzzle: RarityPuzzle;
  puzzleDate: string;
}): RaritySession;
export function rarityDailyStorageKey(dateKey: string): string;
export function formatRarityScore(score: number, decimals?: number): string;
