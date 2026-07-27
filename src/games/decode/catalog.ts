import puzzleData from "./data/puzzles.json" with { type: "json" };

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
export const decodeSourceRevision = puzzleData.sourceRevision;

export const allDecodePuzzles = [
  ...decodeTimedPuzzles[4],
  ...decodeTimedPuzzles[5],
  ...decodeTimedPuzzles[6],
  ...decodeTimedPuzzles[7],
  ...decodeDailyPuzzles,
];

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
