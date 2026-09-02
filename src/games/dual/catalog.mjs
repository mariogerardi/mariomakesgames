import entries from "./data/lexicon.fixture.json" with { type: "json" };
import puzzles from "./data/puzzles.fixture.json" with { type: "json" };
import { createDualLexicon } from "./lexicon.mjs";

export const dualPuzzles = Object.freeze(puzzles);
export const dualLexiconEntries = Object.freeze(entries);
export const dualLexicon = createDualLexicon(entries);
export const DUAL_DAILY_EPOCH = "2026-08-30";

function localDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export function dualDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectDailyDualPuzzle(date = new Date()) {
  const epoch = new Date(`${DUAL_DAILY_EPOCH}T12:00:00`);
  const offset = localDayNumber(date) - localDayNumber(epoch);
  const index = ((offset % dualPuzzles.length) + dualPuzzles.length) % dualPuzzles.length;
  return dualPuzzles[index];
}

export function dualDateFromKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return dualDateKey(date) === dateKey ? date : null;
}

export function dualArchive(days = 14, today = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - index, 12);
    return {
      date,
      dateKey: dualDateKey(date),
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
      puzzle: selectDailyDualPuzzle(date),
    };
  });
}
