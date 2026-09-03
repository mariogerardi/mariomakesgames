import puzzleData from "./data/puzzles.json" with { type: "json" };
import { CURRENT_DAILY_EPOCH, dailyCatalogIndex } from "../../platform/daily-calendar.mjs";

export type DecodePuzzle = {
  id: string;
  answer: string;
  clueWord: string;
  clue: string;
  theme?: string;
};

export const decodeTimedPuzzles = {
  4: puzzleData.timed["4"] as DecodePuzzle[],
  5: puzzleData.timed["5"] as DecodePuzzle[],
  6: puzzleData.timed["6"] as DecodePuzzle[],
  7: puzzleData.timed["7"] as DecodePuzzle[],
} as const;

export const decodeDailyPuzzles = puzzleData.daily as DecodePuzzle[];
export const DECODE_DAILY_EPOCH = CURRENT_DAILY_EPOCH;
export const decodeDailyEditions = [decodeDailyPuzzles] as const;
export const decodeSourceRevision = puzzleData.sourceRevision;

export function selectDailyDecodePuzzles(date: Date | string = new Date()) {
  return decodeDailyEditions[dailyCatalogIndex(date, decodeDailyEditions.length, DECODE_DAILY_EPOCH)];
}

export const allDecodePuzzles = [
  ...decodeTimedPuzzles[4],
  ...decodeTimedPuzzles[5],
  ...decodeTimedPuzzles[6],
  ...decodeTimedPuzzles[7],
  ...decodeDailyPuzzles,
];

export function decodeModePuzzleBank(length: 4 | 5 | 6 | 7) {
  return allDecodePuzzles.filter((puzzle) => puzzle.answer.length === length);
}

export function selectDecodeModePuzzle(
  length: 4 | 5 | 6 | 7,
  random: () => number = Math.random,
) {
  const candidates = decodeModePuzzleBank(length);
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}

export function selectDecodePuzzleFromPool(candidates: DecodePuzzle[], random: () => number = Math.random) {
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}

export function selectTimedDecodePuzzle(
  length: 4 | 5 | 6 | 7,
  random: () => number = Math.random,
) {
  const candidates = decodeTimedPuzzles[length];
  const index = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length)),
  );
  return candidates[index];
}
