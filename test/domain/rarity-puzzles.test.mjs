import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  loadRarityPuzzleCatalog,
  normalizeLiveRarityPuzzle,
  selectFallbackRarityPuzzle,
} from "../../src/games/rarity/puzzle-loader.mjs";
import { repositoryRoot } from "../../src/support/paths.mjs";

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      "src/games/rarity/data/classic-puzzles.json",
    ),
    "utf8",
  ),
);

test("the locked fallback contains classic Rarity only", () => {
  const puzzles = loadRarityPuzzleCatalog(catalog);
  assert.equal(puzzles.length, 35);
  assert.equal(puzzles[0].puzzleString, "the");
  assert.equal(puzzles.at(-1).puzzleString, "str");
  assert.equal(puzzles.some((puzzle) => "board" in puzzle), false);
});

test("fallback selection is stable and cycles across all 35 classics", () => {
  const puzzles = loadRarityPuzzleCatalog(catalog);
  assert.equal(
    selectFallbackRarityPuzzle(puzzles, "2026-02-01").puzzleString,
    "the",
  );
  assert.equal(
    selectFallbackRarityPuzzle(puzzles, "2026-02-02").puzzleString,
    "and",
  );
  assert.equal(
    selectFallbackRarityPuzzle(puzzles, "2026-03-08").puzzleString,
    "the",
  );
  assert.equal(
    selectFallbackRarityPuzzle(puzzles, "2026-01-31").puzzleString,
    "str",
  );
});

test("live authored puzzles normalize and remain authoritative", () => {
  assert.deepEqual(
    normalizeLiveRarityPuzzle(
      {
        puzzle: {
          date: "2026-03-07",
          puzzleString: "STR",
          difficulty: 0,
          curatorName: "auto",
        },
      },
      "2026-03-07",
    ),
    {
      date: "2026-03-07",
      puzzleString: "str",
      difficulty: 0,
      curatorName: "auto",
      source: "live",
    },
  );
});

test("invalid fallback records are rejected", () => {
  assert.throws(
    () => loadRarityPuzzleCatalog([{ puzzleString: "3d" }]),
    /invalid string/,
  );
});
