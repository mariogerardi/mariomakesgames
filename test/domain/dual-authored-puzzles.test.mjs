import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAuthoredDualPuzzles,
  removeAuthoredDualPuzzle,
  scheduleAuthoredDualPuzzle,
} from "../../src/games/dual/authored-puzzles.mjs";

function draft(id = "rug-local") {
  return {
    puzzle: {
      id,
      sequence: "RUG",
      targetScore: 4,
      minimumEnglish: 2,
      minimumSpanish: 2,
      dualCount: 1,
    },
    lexicon: [{
      surface: "rug",
      senses: [{ language: "en", lemma: "rug", familyId: "rug", formKind: "lemma", partOfSpeech: "noun" }],
      policy: { accepted: true },
    }],
  };
}

test("schedules an authored puzzle with its exact lexicon and replaces an existing date", () => {
  const first = scheduleAuthoredDualPuzzle({}, "2026-09-01", draft(), "2026-08-30T12:00:00.000Z");
  const replaced = scheduleAuthoredDualPuzzle(first, "2026-09-01", draft("rug-revised"), "2026-08-30T13:00:00.000Z");

  assert.deepEqual(Object.keys(replaced), ["2026-09-01"]);
  assert.equal(replaced["2026-09-01"].puzzle.id, "rug-revised");
  assert.equal(replaced["2026-09-01"].puzzle.sequence, "RUG");
  assert.equal(replaced["2026-09-01"].lexicon[0].surface, "rug");
});

test("ignores corrupt saved assignments and lets an assignment be removed", () => {
  const parsed = parseAuthoredDualPuzzles(JSON.stringify({
    "2026-09-01": { ...scheduleAuthoredDualPuzzle({}, "2026-09-01", draft())["2026-09-01"] },
    "2026-02-30": { puzzle: draft().puzzle, lexicon: draft().lexicon },
    "2026-09-02": { puzzle: { ...draft().puzzle, sequence: "TOO LONG" }, lexicon: draft().lexicon },
  }));

  assert.deepEqual(Object.keys(parsed), ["2026-09-01"]);
  assert.deepEqual(removeAuthoredDualPuzzle(parsed, "2026-09-01"), {});
});

test("rejects invalid dates or incomplete authored payloads", () => {
  assert.throws(() => scheduleAuthoredDualPuzzle({}, "2026-02-30", draft()));
  assert.throws(() => scheduleAuthoredDualPuzzle({}, "2026-09-01", { puzzle: draft().puzzle, lexicon: [] }));
});
