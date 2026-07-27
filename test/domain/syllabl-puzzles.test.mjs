import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  loadSyllablPuzzleCatalog,
  selectDailySyllablPuzzle,
} from "../../src/games/syllabl/puzzle-loader.mjs";
import {
  repositoryRoot,
  resolveDeveloperPath,
} from "../../src/support/paths.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const bundledPath = path.join(
  repositoryRoot,
  "src/games/syllabl/data/puzzles.json",
);
const legacyPath = resolveDeveloperPath(
  "games/playsyllabl/shuffled_puzzles.json",
);

test("the bundled catalog is an exact copy of locked legacy puzzle data", () => {
  assert.deepEqual(readJson(bundledPath), readJson(legacyPath));
});

test("all 125 canonical daily puzzles satisfy the production schema", () => {
  const puzzles = loadSyllablPuzzleCatalog(readJson(bundledPath));
  assert.equal(puzzles.length, 125);
  assert.equal(puzzles[0].puzzleLetters, "dra");
  assert.equal(new Set(puzzles.map((puzzle) => puzzle.puzzleLetters)).size, 125);
});

test("daily selection preserves the legacy April 13, 2025 rotation", () => {
  const puzzles = loadSyllablPuzzleCatalog(readJson(bundledPath));
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2025-04-13").puzzle.puzzleLetters,
    "dra",
  );
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2025-04-14").puzzle.puzzleLetters,
    "alt",
  );
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2025-04-12").puzzle.puzzleLetters,
    puzzles.at(-1).puzzleLetters,
  );
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2025-08-16").puzzle.puzzleLetters,
    "dra",
  );
});

test("catalog loading rejects malformed puzzle constraints", () => {
  assert.throws(
    () =>
      loadSyllablPuzzleCatalog([
        {
          puzzleLetters: "DRA",
          inputsEnabled: [2, 2, 2, 2, 2, 2],
          syllablesRequired: [1, 1, 1, 1, 1, 1],
        },
      ]),
    /three-letter token/,
  );
  assert.throws(
    () =>
      loadSyllablPuzzleCatalog([
        {
          puzzleLetters: "dra",
          inputsEnabled: [2],
          syllablesRequired: [1, 1, 1, 1, 1, 1],
        },
      ]),
    /six placement codes/,
  );
});
