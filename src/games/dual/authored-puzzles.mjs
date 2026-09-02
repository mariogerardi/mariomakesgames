import { normalizeDualInput } from "./lexicon.mjs";

export const DUAL_AUTHORED_PUZZLES_KEY = "mg-games:v1:dual:authored-puzzles";

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isPuzzle(value) {
  return value && typeof value === "object" && typeof value.id === "string" &&
    /^[a-zñ]{3}$/u.test(normalizeDualInput(value.sequence)) &&
    ["targetScore", "minimumEnglish", "minimumSpanish", "dualCount"].every((key) => Number.isFinite(value[key]));
}

function isLexiconEntry(value) {
  return value && typeof value === "object" && typeof value.surface === "string" &&
    Array.isArray(value.senses) && value.policy?.accepted === true;
}

function normalizeScheduledPuzzle(value) {
  if (!value || typeof value !== "object" || !isDateKey(value.dateKey) || !isPuzzle(value.puzzle) ||
    !Array.isArray(value.lexicon) || value.lexicon.length === 0 || !value.lexicon.every(isLexiconEntry)) return null;
  return {
    version: 1,
    dateKey: value.dateKey,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    puzzle: {
      id: value.puzzle.id,
      sequence: normalizeDualInput(value.puzzle.sequence).toLocaleUpperCase(),
      targetScore: Number(value.puzzle.targetScore),
      minimumEnglish: Number(value.puzzle.minimumEnglish),
      minimumSpanish: Number(value.puzzle.minimumSpanish),
      dualCount: Number(value.puzzle.dualCount),
    },
    lexicon: value.lexicon,
  };
}

export function parseAuthoredDualPuzzles(payload) {
  const parsed = typeof payload === "string" ? (() => {
    try { return JSON.parse(payload); } catch { return null; }
  })() : payload;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed)
    .map(([dateKey, value]) => [dateKey, normalizeScheduledPuzzle({ ...value, dateKey })])
    .filter(([, value]) => value));
}

export function scheduleAuthoredDualPuzzle(library, dateKey, draft, createdAt = new Date().toISOString()) {
  const scheduled = normalizeScheduledPuzzle({
    dateKey,
    createdAt,
    puzzle: draft?.puzzle,
    lexicon: draft?.lexicon,
  });
  if (!scheduled) throw new Error("A playable puzzle and its authored lexicon are required to schedule a date.");
  return { ...parseAuthoredDualPuzzles(library), [dateKey]: scheduled };
}

export function removeAuthoredDualPuzzle(library, dateKey) {
  const next = { ...parseAuthoredDualPuzzles(library) };
  delete next[dateKey];
  return next;
}
