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
  const date = new Date(2026, 8, 1, 12);
  assert.deepEqual(
    selectDailyBridgePuzzle(date),
    selectDailyBridgePuzzle(date),
  );
  assert.ok(allBridgePuzzles.includes(selectDailyBridgePuzzle(date)));
  assert.equal(selectDailyBridgePuzzle(date), allBridgePuzzles[0]);
});

test("the archive begins at the shared September 1 epoch", () => {
  const entries = bridgeArchive(30, new Date(2026, 8, 3, 12));
  assert.equal(entries.length, 3);
  assert.equal(entries[0].date, "2026-09-03");
  assert.equal(entries.at(-1).date, "2026-09-01");
});
