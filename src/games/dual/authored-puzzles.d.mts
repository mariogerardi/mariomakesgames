import type { DualPuzzle } from "./engine.mjs";
import type { DualLexicalEntry } from "./lexicon.mjs";

export type AuthoredDualPuzzle = {
  version: 1;
  dateKey: string;
  createdAt: string;
  puzzle: DualPuzzle;
  lexicon: DualLexicalEntry[];
};

export type AuthoredDualPuzzleLibrary = Record<string, AuthoredDualPuzzle>;

export const DUAL_AUTHORED_PUZZLES_KEY: string;
export function parseAuthoredDualPuzzles(payload: unknown): AuthoredDualPuzzleLibrary;
export function scheduleAuthoredDualPuzzle(
  library: AuthoredDualPuzzleLibrary | unknown,
  dateKey: string,
  draft: { puzzle: DualPuzzle; lexicon: DualLexicalEntry[] },
  createdAt?: string,
): AuthoredDualPuzzleLibrary;
export function removeAuthoredDualPuzzle(library: AuthoredDualPuzzleLibrary | unknown, dateKey: string): AuthoredDualPuzzleLibrary;
