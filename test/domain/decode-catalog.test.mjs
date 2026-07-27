import assert from "node:assert/strict";
import test from "node:test";
import {
  allDecodePuzzles,
  decodeDailyPuzzles,
  decodeSourceRevision,
  decodeTimedPuzzles,
  selectTimedDecodePuzzle,
} from "../../src/games/decode/catalog.ts";

test("the production DECODE catalog preserves 118 unique authored puzzles", () => {
  assert.equal(
    decodeSourceRevision,
    "db2e50e16b04ef317f116583a37a19a72a0b8fc9",
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(decodeTimedPuzzles).map(([length, puzzles]) => [
        length,
        puzzles.length,
      ]),
    ),
    { 4: 35, 5: 27, 6: 22, 7: 29 },
  );
  assert.equal(decodeDailyPuzzles.length, 5);
  assert.equal(allDecodePuzzles.length, 118);
  assert.equal(new Set(allDecodePuzzles.map((puzzle) => puzzle.id)).size, 118);
});

test("the exact duplicated COBALT to BALLOT record is removed", () => {
  const matches = allDecodePuzzles.filter(
    (puzzle) =>
      puzzle.clueWord === "COBALT" &&
      puzzle.answer === "BALLOT" &&
      puzzle.clue === "voting slip",
  );
  assert.equal(matches.length, 1);
});

test("the original fixed Daily 5 stays in its authored order", () => {
  assert.deepEqual(
    decodeDailyPuzzles.map((puzzle) => puzzle.answer),
    ["FISH", "SQUID", "SHRIMP", "OYSTER", "LOBSTER"],
  );
  assert.deepEqual(
    decodeDailyPuzzles.map((puzzle) => puzzle.answer.length),
    [4, 5, 6, 6, 7],
  );
  assert.equal(decodeDailyPuzzles.at(-1).theme, "Sea Creatures");
});

test("Timed selection draws from the requested difficulty pool", () => {
  assert.equal(selectTimedDecodePuzzle(4, () => 0), decodeTimedPuzzles[4][0]);
  assert.equal(
    selectTimedDecodePuzzle(7, () => 0.999),
    decodeTimedPuzzles[7].at(-1),
  );
});
