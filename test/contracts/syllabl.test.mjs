import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSyllablAttempt,
  scoreSyllablFrequency,
  validateSyllablPlacement,
} from "../../src/contracts/syllabl.mjs";
import { readFixture } from "../helpers/fixtures.mjs";

const placementCases = readFixture("syllabl/placement.json");
const scoreCases = readFixture("syllabl/frequency-scores.json");

test("Syllabl placement codes match their exact boundaries", () => {
  for (const fixture of placementCases) {
    assert.equal(
      validateSyllablPlacement(
        fixture.word,
        fixture.puzzleLetters,
        fixture.placementRule,
      ),
      fixture.expected,
      JSON.stringify(fixture),
    );
  }
});

test("Syllabl frequency scores preserve inclusive thresholds", () => {
  for (const fixture of scoreCases) {
    assert.equal(
      scoreSyllablFrequency(fixture.frequency),
      fixture.expectedScore,
      JSON.stringify(fixture),
    );
  }
});

test("Syllabl rejections do not mutate stage, guesses, or score", () => {
  const state = makeState();
  const snapshot = structuredClone(state);
  const result = evaluateSyllablAttempt({
    state,
    word: "gue",
    wordInfo: { isValid: true, frequency: 5, syllableParses: [] },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "too-short");
  assert.deepEqual(state, snapshot);
  assert.equal(result.state, state);
});

test("Syllabl checks placement before remote validity", () => {
  const state = makeState();
  const result = evaluateSyllablAttempt({
    state,
    word: "vague",
    wordInfo: { isValid: false },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "placement");
});

test("Syllabl accepts any matching pronunciation parse", () => {
  const state = makeState();
  state.puzzle.syllablesRequired[0] = 2;
  const result = evaluateSyllablAttempt({
    state,
    word: "guesswork",
    wordInfo: {
      isValid: true,
      frequency: 0.5,
      syllables: 1,
      syllableParses: [
        { count: 1, syllables: ["guesswork"] },
        { count: 2, syllables: ["guess", "work"] },
      ],
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.guess.syllables, 2);
  assert.deepEqual(result.guess.syllableList, ["guess", "work"]);
  assert.equal(result.state.currentStage, 1);
  assert.equal(result.state.score, 4);
  assert.equal(state.currentStage, 0);
  assert.equal(state.score, 0);
});

test("Syllabl advances exactly once and completes at stage six", () => {
  const state = makeState();
  state.currentStage = 5;
  state.puzzle.inputsEnabled[5] = 2;
  state.puzzle.syllablesRequired[5] = 1;
  const result = evaluateSyllablAttempt({
    state,
    word: "guess",
    wordInfo: {
      isValid: true,
      frequency: 100,
      syllableParses: [{ count: 1, syllables: ["guess"] }],
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.state.currentStage, 6);
  assert.equal(result.complete, true);
  assert.equal(result.state.guesses.length, 1);
});

function makeState() {
  return {
    puzzle: {
      puzzleLetters: "gue",
      inputsEnabled: [2, 2, 1, 1, 1, 3],
      syllablesRequired: [1, 3, 1, 2, 3, 2],
    },
    currentStage: 0,
    score: 0,
    guesses: [],
    mode: "daily",
  };
}
