import allPuzzleData from "./data/all-puzzles.json" with { type: "json" };
import minecraftData from "./data/minecraft.json" with { type: "json" };
import type { BridgePuzzle } from "./engine.mjs";
import { CURRENT_DAILY_EPOCH, dailyCatalogIndex, dailyCatalogOffset } from "../../platform/daily-calendar.mjs";

export type BridgePack = {
  id: string;
  name: string;
  description: string;
  puzzles: BridgePuzzle[];
};

function mapPairPuzzles(
  values: Array<{ clues: string[]; answer: string }>,
  position: "before" | "after",
) {
  return values.map((value, index) => ({
    id: `${position}-${String(index + 1).padStart(3, "0")}`,
    clueWords: value.clues.slice(0, 2),
    position,
    answer: value.answer,
    difficulty: position === "before" ? 1 : 2,
  }));
}

const bothPuzzles: BridgePuzzle[] = allPuzzleData.beforeAfter.map(
  (value, index) => ({
    id: `both-${String(index + 1).padStart(3, "0")}`,
    clueWords: [value.beforeClue, value.afterClue],
    position: "both",
    answer: value.answer,
    difficulty: 3,
  }),
);

export const bridgePacks: BridgePack[] = [
  {
    id: "before",
    name: "Before",
    description: "One word begins both phrases.",
    puzzles: mapPairPuzzles(allPuzzleData.before, "before"),
  },
  {
    id: "after",
    name: "After",
    description: "One word completes both phrases.",
    puzzles: mapPairPuzzles(allPuzzleData.after, "after"),
  },
  {
    id: "both",
    name: "Before & After",
    description: "The bridge works on opposite sides.",
    puzzles: bothPuzzles,
  },
  {
    id: "minecraft",
    name: "Minecraft",
    description: "Ten block-built phrase connections.",
    puzzles: minecraftData.puzzles as BridgePuzzle[],
  },
];

export const allBridgePuzzles = bridgePacks.flatMap((pack) => pack.puzzles);

export function bridgeDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectDailyBridgePuzzle(date = new Date()) {
  const index = dailyCatalogIndex(date, allBridgePuzzles.length);
  return allBridgePuzzles[index];
}

export function bridgeArchive(days = 30, date = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const entryDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() - index,
      12,
    );
    return dailyCatalogOffset(entryDate) < 0 ? null : {
      date: bridgeDateKey(entryDate),
      label: new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(entryDate),
      puzzle: selectDailyBridgePuzzle(entryDate),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export { CURRENT_DAILY_EPOCH as BEFORE_AFTER_DAILY_EPOCH };
