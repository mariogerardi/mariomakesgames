import { CURRENT_DAILY_EPOCH, dailyCatalogOffset } from "../../platform/daily-calendar.mjs";

export const SYLLABL_DAILY_START_DATE = CURRENT_DAILY_EPOCH;

function assertDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new TypeError(`Invalid Syllabl date key: ${dateKey}`);

  const [, year, month, day] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`Invalid Syllabl date key: ${dateKey}`);
  }
  return timestamp;
}

function normalizePuzzle(puzzle, index) {
  const token = puzzle?.puzzleLetters;
  const placements = puzzle?.inputsEnabled;
  const syllables = puzzle?.syllablesRequired;

  if (!/^[a-z]{3}$/.test(token ?? "")) {
    throw new TypeError(`Puzzle ${index} must have a three-letter token`);
  }
  if (
    !Array.isArray(placements) ||
    placements.length !== 6 ||
    placements.some(
      (placement) => !Number.isInteger(placement) || placement < 1 || placement > 4,
    )
  ) {
    throw new TypeError(`Puzzle ${index} must have six placement codes`);
  }
  if (
    !Array.isArray(syllables) ||
    syllables.length !== 6 ||
    syllables.some((count) => !Number.isInteger(count) || count < 1)
  ) {
    throw new TypeError(`Puzzle ${index} must have six syllable requirements`);
  }

  return {
    puzzleLetters: token,
    difficulty:
      Number.isFinite(puzzle.difficulty) ? Number(puzzle.difficulty) : null,
    inputsEnabled: [...placements],
    syllablesRequired: [...syllables],
  };
}

export function loadSyllablPuzzleCatalog(rawCatalog) {
  const source = Array.isArray(rawCatalog) ? rawCatalog : rawCatalog?.puzzles;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError("Syllabl puzzle catalog must be a non-empty array");
  }

  const puzzles = source.map(normalizePuzzle);
  const tokens = new Set(puzzles.map((puzzle) => puzzle.puzzleLetters));
  if (tokens.size !== puzzles.length) {
    throw new TypeError("Syllabl puzzle tokens must be unique");
  }
  return puzzles;
}

export function selectDailySyllablPuzzle(
  puzzles,
  dateKey,
  startDateKey = SYLLABL_DAILY_START_DATE,
) {
  if (!Array.isArray(puzzles) || puzzles.length === 0) {
    throw new TypeError("Cannot select from an empty Syllabl catalog");
  }
  assertDateKey(dateKey);
  assertDateKey(startDateKey);
  const dayOffset = dailyCatalogOffset(dateKey, startDateKey);
  const puzzleIndex = ((dayOffset % puzzles.length) + puzzles.length) %
    puzzles.length;
  return { puzzle: puzzles[puzzleIndex], puzzleIndex, dayOffset };
}
