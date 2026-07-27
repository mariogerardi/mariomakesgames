import assert from "node:assert/strict";
import test from "node:test";
import {
  allBridgePuzzles,
  bridgeArchive,
  bridgePacks,
  selectDailyBridgePuzzle,
} from "../../src/games/before-after/catalog.ts";

test("the Before&After catalog includes every authored, non-placeholder puzzle", () => {
  assert.deepEqual(
    bridgePacks.map((pack) => [pack.id, pack.puzzles.length]),
    [
      ["before", 168],
      ["after", 15],
      ["both", 11],
      ["minecraft", 10],
    ],
  );
  assert.equal(allBridgePuzzles.length, 204);
  assert.equal(
    allBridgePuzzles.some(
      (puzzle) =>
        puzzle.answer.includes("?") ||
        puzzle.clueWords.some((clue) => clue.includes("?")),
    ),
    false,
  );
});

test("Daily selection is deterministic for a local calendar date", () => {
  const date = new Date(2026, 6, 27, 12);
  assert.deepEqual(
    selectDailyBridgePuzzle(date),
    selectDailyBridgePuzzle(date),
  );
  assert.ok(allBridgePuzzles.includes(selectDailyBridgePuzzle(date)));
});

test("the archive exposes 30 dated Daily entries newest first", () => {
  const entries = bridgeArchive(30, new Date(2026, 6, 27, 12));
  assert.equal(entries.length, 30);
  assert.equal(entries[0].date, "2026-07-27");
  assert.equal(entries.at(-1).date, "2026-06-28");
  assert.equal(new Set(entries.map((entry) => entry.date)).size, 30);
});
