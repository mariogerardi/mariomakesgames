import { CURRENT_DAILY_EPOCH, dailyCatalogOffset } from "../../platform/daily-calendar.mjs";

export const TOKEN_LIBRARY_SCHEMA_VERSION = 1;
export const TOKEN_DAILY_EPOCH = CURRENT_DAILY_EPOCH;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function finiteInteger(value) {
  return Number.isInteger(value);
}

function isCandidate(value) {
  return Boolean(
    value
    && typeof value.token === "string"
    && Number.isFinite(value.score),
  );
}

export function isTokenPuzzle(value) {
  return Boolean(
    value
    && typeof value.id === "string"
    && (value.difficulty === "easy" || value.difficulty === "hard")
    && typeof value.prompt === "string"
    && Array.isArray(value.responseTokens)
    && value.responseTokens.every((token) => typeof token === "string")
    && Array.isArray(value.stops)
    && value.stops.every((stop) => (
      stop
      && finiteInteger(stop.index)
      && typeof stop.token === "string"
      && Array.isArray(stop.candidates)
      && stop.candidates.every(isCandidate)
    )),
  );
}

export function tokenDateKey(value = new Date()) {
  if (typeof value === "string" && DATE_KEY.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("TOKEN needs a valid calendar date.");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysSinceEpoch(dateKey, epoch = TOKEN_DAILY_EPOCH) {
  return dailyCatalogOffset(dateKey, epoch);
}

export function selectDailyTokenPuzzle(puzzles, { date = new Date(), difficulty }) {
  const dateKey = tokenDateKey(date);
  const pool = (Array.isArray(puzzles) ? puzzles : [])
    .filter((puzzle) => isTokenPuzzle(puzzle) && puzzle.difficulty === difficulty)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!pool.length) return null;
  const offset = daysSinceEpoch(dateKey);
  const index = ((offset % pool.length) + pool.length) % pool.length;
  return { dateKey, index, puzzle: pool[index], total: pool.length };
}

export function createLocalTokenLibraryEntry({
  puzzle,
  title,
  savedAt = new Date().toISOString(),
  dailyDate = null,
}) {
  if (!isTokenPuzzle(puzzle)) throw new Error("Only complete TOKEN puzzles can enter the local archive.");
  const cleanTitle = String(title ?? "").trim().slice(0, 80) || "Untitled local puzzle";
  return {
    dailyDate: typeof dailyDate === "string" && DATE_KEY.test(dailyDate) ? dailyDate : null,
    puzzle: {
      ...puzzle,
      responseTokens: [...puzzle.responseTokens],
      stops: puzzle.stops.map((stop) => ({
        ...stop,
        candidates: stop.candidates.map((candidate) => ({ ...candidate })),
      })),
    },
    savedAt: String(savedAt),
    schemaVersion: TOKEN_LIBRARY_SCHEMA_VERSION,
    title: cleanTitle,
  };
}

export function parseLocalTokenLibrary(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || parsed.schemaVersion !== TOKEN_LIBRARY_SCHEMA_VERSION || !Array.isArray(parsed.entries)) return [];
    return parsed.entries
      .filter((entry) => entry && isTokenPuzzle(entry.puzzle) && typeof entry.title === "string")
      .map((entry) => createLocalTokenLibraryEntry(entry));
  } catch {
    return [];
  }
}

export function serializeLocalTokenLibrary(entries) {
  const safeEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && isTokenPuzzle(entry.puzzle))
    .map((entry) => createLocalTokenLibraryEntry(entry));
  return JSON.stringify({ schemaVersion: TOKEN_LIBRARY_SCHEMA_VERSION, entries: safeEntries });
}

export function upsertLocalTokenLibraryEntry(entries, nextEntry) {
  const normalized = createLocalTokenLibraryEntry(nextEntry);
  const prior = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.puzzle?.id !== normalized.puzzle.id)
    .map((entry) => createLocalTokenLibraryEntry(entry));
  return [normalized, ...prior];
}
