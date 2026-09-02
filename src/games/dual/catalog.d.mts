import type { DualPuzzle } from "./engine.mjs";
import type { DualLexicalEntry, DualLexicon } from "./lexicon.mjs";

export const dualPuzzles: readonly DualPuzzle[];
export const dualLexiconEntries: readonly DualLexicalEntry[];
export const dualLexicon: DualLexicon;
export const DUAL_DAILY_EPOCH: string;
export function dualDateKey(date?: Date): string;
export function dualDateFromKey(dateKey: string): Date | null;
export function selectDailyDualPuzzle(date?: Date): DualPuzzle;
export function dualArchive(days?: number, today?: Date): Array<{
  date: Date;
  dateKey: string;
  label: string;
  puzzle: DualPuzzle;
}>;
