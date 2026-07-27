import type { SyllablPuzzle } from "./engine.mjs";

export type CatalogSyllablPuzzle = SyllablPuzzle & {
  difficulty: number | null;
};
export const SYLLABL_DAILY_START_DATE: "2025-04-13";
export function loadSyllablPuzzleCatalog(
  rawCatalog: unknown,
): CatalogSyllablPuzzle[];
export function selectDailySyllablPuzzle(
  puzzles: CatalogSyllablPuzzle[],
  dateKey: string,
  startDateKey?: string,
): {
  puzzle: CatalogSyllablPuzzle;
  puzzleIndex: number;
  dayOffset: number;
};
