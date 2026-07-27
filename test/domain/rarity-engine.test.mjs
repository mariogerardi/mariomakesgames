import assert from "node:assert/strict";
import test from "node:test";
import {
  createRaritySession,
  evaluateRarityAttempt,
  formatRarityScore,
  hydrateRaritySession,
  RARITY_TIER_LABELS,
  rarityDailyStorageKey,
  serializeRaritySubmission,
} from "../../src/games/rarity/engine.mjs";

const puzzle = {
  date: "2026-07-26",
  puzzleString: "str",
  difficulty: 0,
  curatorName: "",
  source: "fallback",
};

test("production Rarity locks on the first valid scored word", () => {
  const session = createRaritySession({
    puzzle,
    puzzleDate: "2026-07-26",
  });
  const accepted = evaluateRarityAttempt({
    state: session,
    puzzleString: "str",
    word: "street",
    wordInfo: {
      isValid: true,
      frequency: 10,
      definition: "A public road.",
      partOfSpeech: "noun",
      shortDefinitions: ["A public road."],
    },
    timestamp: "2026-07-26T12:00:00.000Z",
  });

  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.hasSubmitted, true);
  assert.equal(accepted.submission.exactScore, 27.39053);
  assert.equal(accepted.submission.definition, "A public road.");
  assert.equal(accepted.submission.partOfSpeech, "noun");

  const locked = evaluateRarityAttempt({
    state: accepted.state,
    puzzleString: "str",
    word: "strange",
    wordInfo: { isValid: true, frequency: 1 },
  });
  assert.equal(locked.accepted, false);
  assert.equal(locked.reason, "already-submitted");
  assert.equal(locked.state, accepted.state);
});

test("invalid production attempts do not consume the submission", () => {
  const session = createRaritySession({
    puzzle,
    puzzleDate: "2026-07-26",
  });
  const result = evaluateRarityAttempt({
    state: session,
    puzzleString: "str",
    word: "rare",
    wordInfo: { isValid: true, frequency: 1 },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "token-missing");
  assert.equal(result.state, session);
  assert.equal(session.hasSubmitted, false);
});

test("production serialization and hydration preserve the locked result", () => {
  const session = createRaritySession({
    puzzle,
    puzzleDate: "2026-07-26",
  });
  const accepted = evaluateRarityAttempt({
    state: session,
    puzzleString: "str",
    word: "street",
    wordInfo: {
      isValid: true,
      frequency: 10,
      rarityScore: 27.39053,
      definition: "A public road.",
      allPartsOfSpeech: ["noun"],
    },
    timestamp: "2026-07-26T12:00:00.000Z",
  });
  const payload = serializeRaritySubmission("str", accepted.submission);
  const restored = hydrateRaritySession({
    payload,
    puzzle,
    puzzleDate: "2026-07-26",
  });

  assert.equal(restored.hasSubmitted, true);
  assert.equal(restored.submission.word, "street");
  assert.equal(restored.submission.exactScore, 27.39053);
  assert.equal(restored.submission.definition, "A public road.");
  assert.deepEqual(restored.submission.allPartsOfSpeech, ["noun"]);
});

test("mismatched puzzle storage never locks a new daily", () => {
  const restored = hydrateRaritySession({
    payload: {
      puzzleString: "ink",
      word: "inking",
      frequency: 1,
      exactScore: 50,
    },
    puzzle,
    puzzleDate: "2026-07-26",
  });
  assert.equal(restored.hasSubmitted, false);
  assert.equal(restored.submission, null);
});

test("corrupt stored scoring data never locks the daily", () => {
  const restored = hydrateRaritySession({
    payload: {
      puzzleString: "str",
      word: "street",
      frequency: "not-a-number",
    },
    puzzle,
    puzzleDate: "2026-07-26",
  });
  assert.equal(restored.hasSubmitted, false);
});

test("display helpers retain legacy precision and tier language", () => {
  assert.equal(formatRarityScore(27.39053), "27.3905");
  assert.equal(formatRarityScore(100), "99.9999");
  assert.equal(RARITY_TIER_LABELS[1], "Very common");
  assert.equal(RARITY_TIER_LABELS[6], "Legendary");
  assert.equal(
    rarityDailyStorageKey("2026-07-26"),
    "rarity_daily_2026-07-26",
  );
});
