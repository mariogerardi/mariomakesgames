import puzzleData from "./data/puzzles.json" with { type: "json" };
import type { Expl41nPuzzle } from "./engine.mjs";

export const expl41nPuzzles = puzzleData.puzzles as Expl41nPuzzle[];

const DAY_MS = 86_400_000;

export function legacyExpl41nDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(date);
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectExpl41nDailyPuzzle(date = new Date()) {
  const authoredDate = legacyExpl41nDate(date);
  const authored = expl41nPuzzles.find((puzzle) => puzzle.date === authoredDate);
  if (authored) return { puzzle: authored, isFallback: false };

  const dayIndex = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
  const index = ((dayIndex % expl41nPuzzles.length) + expl41nPuzzles.length) %
    expl41nPuzzles.length;
  return { puzzle: expl41nPuzzles[index], isFallback: true };
}

export function randomExpl41nPuzzle(
  currentWord: string,
  random = Math.random,
) {
  const candidates = expl41nPuzzles.filter(
    (puzzle) => puzzle.word.toLowerCase() !== currentWord.toLowerCase(),
  );
  return candidates[Math.floor(random() * candidates.length)];
}

export type Expl41nArchiveMonth = {
  key: string;
  label: string;
  puzzles: Expl41nPuzzle[];
};

export const expl41nArchiveMonths: Expl41nArchiveMonth[] = Array.from(
  expl41nPuzzles.reduce((months, puzzle) => {
    const parsed = new Date(`${puzzle.date} 12:00:00`);
    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    const entry = months.get(key) ?? {
      key,
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(parsed),
      puzzles: [],
    };
    entry.puzzles.push(puzzle);
    months.set(key, entry);
    return months;
  }, new Map<string, Expl41nArchiveMonth>()).values(),
).sort((a, b) => b.key.localeCompare(a.key));
