import { CURRENT_DAILY_EPOCH, dailyCatalogOffset } from "../../platform/daily-calendar.mjs";

export const RARITY_FALLBACK_START_DATE = CURRENT_DAILY_EPOCH;

function dateTimestamp(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new TypeError(`Invalid Rarity date key: ${dateKey}`);
  const [, year, month, day] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`Invalid Rarity date key: ${dateKey}`);
  }
  return timestamp;
}

function normalizePuzzle(puzzle, index) {
  const puzzleString = String(puzzle?.puzzleString ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2,10}$/.test(puzzleString)) {
    throw new TypeError(`Rarity puzzle ${index} has an invalid string`);
  }
  return {
    date: typeof puzzle.date === "string" ? puzzle.date : null,
    puzzleString,
    difficulty: Number(puzzle.difficulty ?? 0),
    curatorName:
      typeof puzzle.curatorName === "string" ? puzzle.curatorName.trim() : "",
    source: puzzle.source === "live" ? "live" : "fallback",
  };
}

export function loadRarityPuzzleCatalog(rawCatalog) {
  const source = Array.isArray(rawCatalog) ? rawCatalog : rawCatalog?.puzzles;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError("Rarity puzzle catalog must be a non-empty array");
  }
  return source.map(normalizePuzzle);
}

export function selectFallbackRarityPuzzle(
  puzzles,
  dateKey,
  startDateKey = RARITY_FALLBACK_START_DATE,
) {
  if (!Array.isArray(puzzles) || puzzles.length === 0) {
    throw new TypeError("Cannot select from an empty Rarity catalog");
  }
  dateTimestamp(dateKey);
  dateTimestamp(startDateKey);
  const dayOffset = dailyCatalogOffset(dateKey, startDateKey);
  const puzzleIndex =
    ((dayOffset % puzzles.length) + puzzles.length) % puzzles.length;
  return {
    ...puzzles[puzzleIndex],
    date: dateKey,
    source: "fallback",
    puzzleIndex,
    dayOffset,
  };
}

export function normalizeLiveRarityPuzzle(payload, dateKey) {
  const raw = payload?.puzzle ?? payload;
  return {
    ...normalizePuzzle({ ...raw, source: "live" }, 0),
    date: raw?.date ?? dateKey,
    source: "live",
  };
}
