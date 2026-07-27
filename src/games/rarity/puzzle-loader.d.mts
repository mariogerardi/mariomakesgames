export type RarityPuzzle = {
  date: string | null;
  puzzleString: string;
  difficulty: number;
  curatorName: string;
  source: "live" | "fallback";
};
export const RARITY_FALLBACK_START_DATE: "2026-02-01";
export function loadRarityPuzzleCatalog(rawCatalog: unknown): RarityPuzzle[];
export function selectFallbackRarityPuzzle(
  puzzles: RarityPuzzle[],
  dateKey: string,
  startDateKey?: string,
): RarityPuzzle & { puzzleIndex: number; dayOffset: number };
export function normalizeLiveRarityPuzzle(
  payload: unknown,
  dateKey: string,
): RarityPuzzle;
