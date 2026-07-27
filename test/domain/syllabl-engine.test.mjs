import assert from "node:assert/strict";
import test from "node:test";
import {
  createSyllablSession,
  evaluateSyllablAttempt,
  hydrateSyllablSession,
  serializeSyllablSession,
  syllablDailyStorageKey,
  validateSyllablPlacement,
} from "../../src/games/syllabl/engine.mjs";
import {
  createSyllablWordValidator,
  normalizeSyllablWordInfo,
} from "../../src/games/syllabl/word-validator.mjs";

const puzzle = {
  puzzleLetters: "dra",
  inputsEnabled: [2, 2, 2, 2, 2, 2],
  syllablesRequired: [2, 2, 2, 2, 2, 2],
};

function validWordInfo() {
  return {
    isValid: true,
    frequency: 0.001,
    syllables: 1,
    syllableList: ["drag", "on"],
    syllableParses: [
      { count: 1, syllables: ["dragon"] },
      { count: 2, syllables: ["drag", "on"] },
    ],
  };
}

test("placement codes preserve the four legacy rules", () => {
  assert.equal(validateSyllablPlacement("hydra", "dra", 1), true);
  assert.equal(validateSyllablPlacement("dragon", "dra", 2), true);
  assert.equal(validateSyllablPlacement("bedraggled", "dra", 3), true);
  assert.equal(validateSyllablPlacement("dradra", "dra", 4), true);
  assert.equal(validateSyllablPlacement("dragon", "dra", 3), false);
});

test("attempt validation stays ordered and rejected attempts are immutable", () => {
  const session = createSyllablSession({
    puzzle,
    puzzleDate: "2026-07-26",
  });

  const shortResult = evaluateSyllablAttempt({
    session,
    word: "dra",
    wordInfo: validWordInfo(),
  });
  assert.equal(shortResult.reason, "too-short");
  assert.equal(shortResult.session, session);

  const placementResult = evaluateSyllablAttempt({
    session,
    word: "hydra",
    wordInfo: { isValid: false },
  });
  assert.equal(placementResult.reason, "placement");
  assert.equal(placementResult.session, session);
  assert.deepEqual(session.guesses, []);
  assert.equal(session.currentStage, 0);
});

test("any qualifying pronunciation accepts and advances exactly one stage", () => {
  const session = createSyllablSession({
    puzzle,
    puzzleDate: "2026-07-26",
  });
  const result = evaluateSyllablAttempt({
    session,
    word: " Dragon ",
    wordInfo: validWordInfo(),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.session.currentStage, 1);
  assert.equal(result.session.status, "in-progress");
  assert.deepEqual(result.guess, {
    word: "dragon",
    syllables: 2,
    syllableList: ["drag", "on"],
  });
  assert.equal("score" in result.guess, false);
  assert.equal("frequency" in result.guess, false);
  assert.equal(session.currentStage, 0);
});

test("six accepted stages complete without a score", () => {
  let session = createSyllablSession({
    puzzle,
    puzzleDate: "2026-07-26",
  });

  for (let stage = 0; stage < 6; stage += 1) {
    const result = evaluateSyllablAttempt({
      session,
      word: `dragon${stage}`,
      wordInfo: validWordInfo(),
    });
    assert.equal(result.accepted, true);
    session = result.session;
  }

  assert.equal(session.currentStage, 6);
  assert.equal(session.status, "complete");
  assert.equal(session.guesses.length, 6);
  assert.equal("score" in session, false);
  assert.equal(
    evaluateSyllablAttempt({
      session,
      word: "dragon",
      wordInfo: validWordInfo(),
    }).reason,
    "already-complete",
  );
});

test("legacy hydration preserves progress while dropping scoring fields", () => {
  const session = hydrateSyllablSession({
    puzzle,
    puzzleDate: "2026-07-26",
    stored: {
      puzzleLetters: "dra",
      puzzleDate: "2026-07-26",
      currentStage: 1,
      score: 5,
      guesses: [
        {
          word: "dragon",
          syllables: 2,
          syllableList: ["drag", "on"],
          score: 5,
          frequency: 0.001,
        },
      ],
    },
  });
  const persisted = serializeSyllablSession(session);

  assert.equal(session.currentStage, 1);
  assert.equal("score" in session, false);
  assert.equal("score" in session.guesses[0], false);
  assert.equal("frequency" in session.guesses[0], false);
  assert.equal(JSON.stringify(persisted).includes("score"), false);
  assert.equal(JSON.stringify(persisted).includes("frequency"), false);
  assert.equal(
    syllablDailyStorageKey("2026-07-26"),
    "mg-games:v2:syllabl:daily-2026-07-26",
  );
});

test("mismatched stored puzzles start a fresh session", () => {
  const session = hydrateSyllablSession({
    puzzle,
    puzzleDate: "2026-07-26",
    stored: {
      puzzleLetters: "alt",
      puzzleDate: "2026-07-26",
      currentStage: 4,
      guesses: [{ word: "alter" }],
    },
  });
  assert.equal(session.currentStage, 0);
  assert.deepEqual(session.guesses, []);
});

test("the production word boundary deliberately discards frequency", async () => {
  const normalized = normalizeSyllablWordInfo(validWordInfo());
  assert.equal("frequency" in normalized, false);

  const validateWord = createSyllablWordValidator({
    endpoint: "/api/wordinfo",
    fetcher: async (url) => ({
      ok: true,
      json: async () => ({ ...validWordInfo(), requestedUrl: url }),
    }),
  });
  const result = await validateWord(" Dragon ");
  assert.equal(result.isValid, true);
  assert.equal("frequency" in result, false);
});
