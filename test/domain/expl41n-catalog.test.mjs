import assert from "node:assert/strict";
import test from "node:test";
import {
  expl41nArchiveMonths,
  expl41nPuzzles,
  randomExpl41nPuzzle,
  selectExpl41nDailyPuzzle,
} from "../../src/games/expl41n/catalog.ts";

test("the locked Expl41n corpus preserves all 380 authored puzzles", () => {
  assert.equal(expl41nPuzzles.length, 380);
  assert.equal(expl41nPuzzles[0].date, "February 01, 2025");
  assert.equal(expl41nPuzzles.at(-1).date, "February 15, 2026");
  assert.equal(expl41nArchiveMonths.length, 13);
});

test("authored Expl41n dates remain authoritative", () => {
  const result = selectExpl41nDailyPuzzle(new Date(2025, 1, 1, 12));
  assert.equal(result.isFallback, false);
  assert.equal(result.puzzle.word, "Eagle");
});

test("post-archive Expl41n dates get a deterministic classic fallback", () => {
  const date = new Date(2026, 6, 26, 12);
  const first = selectExpl41nDailyPuzzle(date);
  const second = selectExpl41nDailyPuzzle(date);
  assert.equal(first.isFallback, true);
  assert.deepEqual(first, second);
  assert.ok(expl41nPuzzles.includes(first.puzzle));
});

test("Shuffle excludes the current word", () => {
  const result = randomExpl41nPuzzle("Eagle", () => 0);
  assert.notEqual(result.word.toLowerCase(), "eagle");
});
