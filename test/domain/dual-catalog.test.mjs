import assert from "node:assert/strict";
import test from "node:test";
import {
  dualLexicon,
  dualPuzzles,
  selectDailyDualPuzzle,
} from "../../src/games/dual/catalog.mjs";
import {
  canonicalContainsSequence,
  isDualEntry,
} from "../../src/games/dual/lexicon.mjs";

test("DUAL fixture puzzles have accepted bilingual pools and exact Dual counts", () => {
  for (const puzzle of dualPuzzles) {
    const pool = dualLexicon.entries.filter((entry) => canonicalContainsSequence(entry.surface, puzzle.sequence));
    const english = pool.filter((entry) => entry.senses.some((sense) => sense.language === "en"));
    const spanish = pool.filter((entry) => entry.senses.some((sense) => sense.language === "es"));
    const duals = pool.filter(isDualEntry);
    assert.ok(english.length >= puzzle.minimumEnglish, `${puzzle.id} needs a viable English pool`);
    assert.ok(spanish.length >= puzzle.minimumSpanish, `${puzzle.id} needs a viable Spanish pool`);
    assert.equal(duals.length, puzzle.dualCount, `${puzzle.id} Dual count drifted`);
    assert.ok(puzzle.targetScore >= puzzle.minimumEnglish + puzzle.minimumSpanish);
  }
});

test("DUAL daily selection is stable and rotates by local calendar date", () => {
  assert.equal(selectDailyDualPuzzle(new Date(2026, 7, 30, 12)).id, "ota-001");
  assert.equal(selectDailyDualPuzzle(new Date(2026, 7, 31, 12)).id, "tra-001");
  assert.equal(selectDailyDualPuzzle(new Date(2026, 8, 1, 12)).id, "ota-001");
});
