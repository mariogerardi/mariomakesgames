import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRarityScore,
  determineRarityTier,
  evaluateRarityAttempt,
  hydrateRaritySubmission,
  serializeRaritySubmission,
  validateRarityLocalRules,
} from "../../src/contracts/rarity.mjs";
import { readFixture } from "../helpers/fixtures.mjs";

const scoreCases = readFixture("rarity/frequency-scores.json");

test("Rarity local validation preserves order and boundaries", () => {
  assert.deepEqual(validateRarityLocalRules("str", "str"), {
    valid: false,
    reason: "too-short",
  });
  assert.deepEqual(validateRarityLocalRules("str33t", "str"), {
    valid: false,
    reason: "letters-only",
  });
  assert.deepEqual(validateRarityLocalRules("rare", "str"), {
    valid: false,
    reason: "token-missing",
  });
  assert.deepEqual(validateRarityLocalRules("street", "STR"), {
    valid: true,
    reason: null,
  });
});

test("Rarity score and tiers match golden frequencies", () => {
  for (const fixture of scoreCases) {
    const { score } = calculateRarityScore(fixture.frequency);
    assert.equal(score, fixture.expectedScore, JSON.stringify(fixture));
    assert.equal(
      determineRarityTier(score),
      fixture.expectedTier,
      JSON.stringify(fixture),
    );
  }
});

test("Rarity rejected attempts do not lock or mutate state", () => {
  const state = { hasSubmitted: false, submission: null };
  const snapshot = structuredClone(state);
  const result = evaluateRarityAttempt({
    state,
    puzzleString: "str",
    word: "rare",
    wordInfo: { isValid: true, frequency: 1 },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "token-missing");
  assert.deepEqual(state, snapshot);
  assert.equal(result.state, state);
});

test("Rarity locks on the first accepted answer", () => {
  const state = { hasSubmitted: false, submission: null };
  const first = evaluateRarityAttempt({
    state,
    puzzleString: "str",
    word: "street",
    wordInfo: { isValid: true, frequency: 10 },
    timestamp: "2026-03-07T12:00:00.000Z",
  });

  assert.equal(first.accepted, true);
  assert.equal(first.state.hasSubmitted, true);
  assert.equal(first.submission.word, "street");
  assert.equal(first.submission.exactScore, 27.39053);

  const second = evaluateRarityAttempt({
    state: first.state,
    puzzleString: "str",
    word: "strange",
    wordInfo: { isValid: true, frequency: 1 },
  });
  assert.equal(second.accepted, false);
  assert.equal(second.reason, "already-submitted");
  assert.equal(second.state, first.state);
});

test("Rarity preserves the legacy local save and restore shape", () => {
  const submission = {
    word: "street",
    frequency: 10,
    exactScore: 27.39053,
    tier: 1,
    definition: "A public road.",
    shortDefinitions: ["A public road."],
    timestamp: "2026-03-07T12:00:00.000Z",
  };
  const payload = serializeRaritySubmission("str", submission);

  assert.equal(payload.puzzleString, "str");
  assert.equal(payload.submittedAt, submission.timestamp);
  assert.equal(payload.definitionCount, 0);
  assert.deepEqual(payload.usageLabels, []);

  const restored = hydrateRaritySubmission(payload, {
    profile: {
      userId: "local-user",
      displayName: "Player",
      userType: "anonymous",
    },
  });
  assert.equal(restored.word, submission.word);
  assert.equal(restored.exactScore, submission.exactScore);
  assert.equal(restored.tier, submission.tier);
  assert.equal(restored.timestamp, submission.timestamp);
  assert.equal(restored.userId, "local-user");
});
