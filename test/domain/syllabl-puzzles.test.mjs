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
const hasLegacyBundle = fs.existsSync(legacyPath);

if (hasLegacyBundle) {
  test("the bundled catalog is an exact copy of locked legacy puzzle data", () => {
    assert.deepEqual(readJson(bundledPath), readJson(legacyPath));
  });
} else {
  test.skip("the bundled catalog is an exact copy of locked legacy puzzle data", () => {
    // Legacy source data is not present in the current checkout; this verification
    // is intentionally skipped to keep the default repo test path self-contained.
  });
}

test("all 125 canonical daily puzzles satisfy the production schema", () => {
  const puzzles = loadSyllablPuzzleCatalog(readJson(bundledPath));
  assert.equal(puzzles.length, 125);
  assert.equal(puzzles[0].puzzleLetters, "dra");
  assert.equal(new Set(puzzles.map((puzzle) => puzzle.puzzleLetters)).size, 125);
});

test("the historical catalog is remapped from September 1, 2026", () => {
  const puzzles = loadSyllablPuzzleCatalog(readJson(bundledPath));
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2026-09-01").puzzle.puzzleLetters,
    "dra",
  );
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2026-09-02").puzzle.puzzleLetters,
    "alt",
  );
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2026-08-31").puzzle.puzzleLetters,
    puzzles.at(-1).puzzleLetters,
  );
  assert.equal(
    selectDailySyllablPuzzle(puzzles, "2027-01-04").puzzle.puzzleLetters,
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
