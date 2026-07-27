import assert from "node:assert/strict";
import test from "node:test";
import {
  createDecodeState,
  deriveDecodeFeedback,
  evaluateDecodeAttempt,
  formatDecodeTime,
  normalizeDecodeInput,
  tickDecodeClock,
} from "../../src/games/decode/engine.mjs";

test("the production DECODE engine uses duplicate-aware derived feedback", () => {
  assert.deepEqual(deriveDecodeFeedback("LURE", "GLUE"), [
    "present",
    "present",
    "absent",
    "correct",
  ]);
  assert.deepEqual(deriveDecodeFeedback("PHOENIX", "PARADOX"), [
    "correct",
    "absent",
    "present",
    "absent",
    "absent",
    "absent",
    "correct",
  ]);
});

test("DECODE input accepts letters only, uppercases, and respects length", () => {
  assert.equal(normalizeDecodeInput(" a-b3cdef ", 4), "ABCD");
  assert.equal(normalizeDecodeInput("squid", 5), "SQUID");
});

test("incorrect production guesses do not mutate the run", () => {
  const state = createDecodeState("timed");
  const result = evaluateDecodeAttempt({
    state,
    answer: "BARE",
    guess: "BAKE",
  });
  assert.equal(result.correct, false);
  assert.equal(result.state, state);
});

test("Timed play resets twenty seconds and escalates after every ten solves", () => {
  const state = {
    ...createDecodeState("timed"),
    score: 9,
    secondsRemaining: 1,
  };
  const result = evaluateDecodeAttempt({
    state,
    answer: "BARE",
    guess: "bare",
  });
  assert.equal(result.correct, true);
  assert.equal(result.state.score, 10);
  assert.equal(result.state.secondsRemaining, 20);
  assert.equal(result.nextWordLength, 5);
  assert.equal(tickDecodeClock(result.state, 20).status, "expired");
});

test("Daily 5 completion preserves its elapsed clock", () => {
  let state = tickDecodeClock(createDecodeState("daily-5"), 73);
  for (const answer of ["FISH", "SQUID", "SHRIMP", "OYSTER", "LOBSTER"]) {
    state = evaluateDecodeAttempt({ state, answer, guess: answer }).state;
  }
  assert.equal(state.status, "complete");
  assert.equal(state.elapsedSeconds, 73);
  assert.equal(formatDecodeTime(state.elapsedSeconds), "1:13");
});
