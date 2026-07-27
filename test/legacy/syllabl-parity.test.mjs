import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreSyllablFrequency,
  validateSyllablPlacement,
} from "../../src/contracts/syllabl.mjs";
import { resolveDeveloperPath } from "../../src/support/paths.mjs";
import { readFixture } from "../helpers/fixtures.mjs";
import { loadLegacyFunction } from "../helpers/legacy-function.mjs";

const scriptPath = resolveDeveloperPath("games/playsyllabl/script.js");
const legacyScore = loadLegacyFunction(
  scriptPath,
  "determineScoreFromFrequency",
);
const legacyState = {
  puzzle: {
    puzzleLetters: "",
    inputsEnabled: [1],
    syllablesRequired: [1],
  },
  currentStage: 0,
};
const legacyValidateGuess = loadLegacyFunction(scriptPath, "validateGuess", {
  state: legacyState,
});

test("Syllabl score contract matches the locked legacy function", () => {
  for (const fixture of readFixture("syllabl/frequency-scores.json")) {
    assert.equal(
      scoreSyllablFrequency(fixture.frequency),
      legacyScore(fixture.frequency),
    );
  }
});

test("Syllabl placement contract matches the locked legacy function", () => {
  for (const fixture of readFixture("syllabl/placement.json")) {
    legacyState.puzzle.puzzleLetters = fixture.puzzleLetters;
    legacyState.puzzle.inputsEnabled[0] = fixture.placementRule;
    const legacyResult = legacyValidateGuess(fixture.word);
    assert.equal(
      validateSyllablPlacement(
        fixture.word,
        fixture.puzzleLetters,
        fixture.placementRule,
      ),
      legacyResult.isValidPlacement,
    );
    assert.equal(legacyResult.isValidPlacement, fixture.expected);
  }
});
