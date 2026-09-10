import assert from "node:assert/strict";
import test from "node:test";
import {
  allBridgePuzzles,
  bridgeArchive,
  bridgeCompleteArchive,
  bridgePacks,
  bridgePackCollections,
  fundamentalBridgePacks,
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
  assert.deepEqual(bridgePackCollections.map((collection) => [collection.id, collection.packs.map((pack) => pack.id)]), [
    ["fundamentals", ["before-101", "after-101", "both-101"]],
    ["worlds", ["minecraft"]],
  ]);
  assert.equal(allBridgePuzzles.length, 204);
  assert.deepEqual(
    fundamentalBridgePacks.map((pack) => [pack.id, pack.puzzles.length]),
    [["before-101", 10], ["after-101", 10], ["both-101", 10]],
  );
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

test("the complete archive grows from the shared epoch instead of dropping older days", () => {
  const entries = bridgeCompleteArchive(new Date(2026, 9, 15, 12));
  assert.equal(entries[0].date, "2026-10-15");
  assert.equal(entries.at(-1).date, "2026-09-01");
  assert.equal(entries.length, 45);
});
