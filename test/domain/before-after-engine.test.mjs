import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgePhrases,
  createBridgeSession,
  hydrateBridgeSession,
  remainingBridgeSeconds,
  serializeBridgeSession,
  submitBridgeAnswer,
  validateCustomBridgePuzzle,
} from "../../src/games/before-after/engine.mjs";

const beforePuzzle = {
  id: "before-001",
  clueWords: ["laugh", "straw"],
  position: "before",
  answer: "LAST",
  difficulty: 1,
};

test("Before&After preserves all three bridge directions", () => {
  assert.deepEqual(bridgePhrases(beforePuzzle), ["last laugh", "last straw"]);
  assert.deepEqual(
    bridgePhrases({ ...beforePuzzle, position: "after", clueWords: ["book", "life"] }),
    ["book last", "life last"],
  );
  assert.deepEqual(
    bridgePhrases({ ...beforePuzzle, position: "both", clueWords: ["ditch", "effort"] }),
    ["last ditch", "effort last"],
  );
});

test("answers compare case-insensitively after trimming", () => {
  const session = createBridgeSession({
    puzzle: beforePuzzle,
    mode: "packs",
    startedAt: 1_000,
  });
  const result = submitBridgeAnswer(session, "  last  ", 2_000);
  assert.equal(result.accepted, true);
  assert.equal(result.correct, true);
  assert.equal(result.state.status, "solved");
  assert.equal(result.state.durationMs, 1_000);
});

test("pack attempts are unlimited and incorrect guesses do not lock play", () => {
  let session = createBridgeSession({
    puzzle: beforePuzzle,
    mode: "packs",
    startedAt: 1_000,
  });
  for (let index = 0; index < 12; index += 1) {
    const result = submitBridgeAnswer(session, `wrong${index}`, 2_000 + index);
    assert.equal(result.accepted, true);
    session = result.state;
  }
  assert.equal(session.status, "active");
  assert.equal(session.attempts, 12);
});

test("empty and post-completion submissions are rejected without mutation", () => {
  const session = createBridgeSession({
    puzzle: beforePuzzle,
    mode: "packs",
    startedAt: 1_000,
  });
  assert.equal(submitBridgeAnswer(session, " ").state, session);
  const solved = submitBridgeAnswer(session, "last", 2_000).state;
  const replay = submitBridgeAnswer(solved, "wrong", 3_000);
  assert.equal(replay.accepted, false);
  assert.equal(replay.state, solved);
  assert.equal(replay.state.attempts, 1);
});

test("Daily remains open for unlimited guesses until exactly 60 seconds", () => {
  let session = createBridgeSession({
    puzzle: beforePuzzle,
    mode: "daily",
    startedAt: 10_000,
  });
  for (let index = 0; index < 8; index += 1) {
    session = submitBridgeAnswer(session, "wrong", 11_000 + index).state;
  }
  assert.equal(session.status, "active");
  assert.equal(remainingBridgeSeconds(session, 69_999), 1);
  const expired = submitBridgeAnswer(session, "last", 70_000);
  assert.equal(expired.accepted, false);
  assert.equal(expired.state.status, "expired");
});

test("custom puzzles require one short answer and two unique clues", () => {
  assert.equal(
    validateCustomBridgePuzzle({
      answer: "",
      clueOne: "laugh",
      clueTwo: "straw",
      position: "before",
    }).reason,
    "answer-required",
  );
  assert.equal(
    validateCustomBridgePuzzle({
      answer: "last",
      clueOne: "same",
      clueTwo: "SAME",
      position: "before",
    }).reason,
    "clues-unique",
  );
  const valid = validateCustomBridgePuzzle({
    answer: "last",
    clueOne: "laugh",
    clueTwo: "straw",
    position: "before",
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.puzzle.answer, "last");
});

test("hydration restores only a matching session and expires stale Daily play", () => {
  const session = createBridgeSession({
    puzzle: beforePuzzle,
    mode: "daily",
    startedAt: 10_000,
  });
  const payload = serializeBridgeSession(
    submitBridgeAnswer(session, "wrong", 11_000).state,
  );
  const restored = hydrateBridgeSession({
    payload,
    puzzle: beforePuzzle,
    mode: "daily",
    now: 70_000,
  });
  assert.equal(restored.status, "expired");
  assert.equal(restored.attempts, 1);

  const fresh = hydrateBridgeSession({
    payload,
    puzzle: { ...beforePuzzle, id: "different" },
    mode: "daily",
    now: 20_000,
  });
  assert.equal(fresh.attempts, 0);
});
