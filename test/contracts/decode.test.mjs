import assert from "node:assert/strict";
import test from "node:test";
import {
  createDecodeState,
  decodeTimedWordLength,
  deriveDecodeFeedback,
  evaluateDecodeAttempt,
  tickDecodeClock,
} from "../../src/contracts/decode.mjs";
import { readFixture } from "../helpers/fixtures.mjs";

const fixture = readFixture("decode/mechanics.json");

test("DECODE derives positional feedback with duplicate-letter accounting", () => {
  for (const example of fixture.feedbackCases) {
    assert.deepEqual(
      deriveDecodeFeedback(example.clue, example.answer),
      example.expected,
      JSON.stringify(example),
    );
  }
});

test("DECODE records known authored-color anomalies without canonizing them", () => {
  const colorAnomalies = fixture.legacyDataAnomalies.filter(
    (anomaly) => anomaly.authored,
  );
  for (const anomaly of colorAnomalies) {
    assert.notDeepEqual(anomaly.authored, anomaly.derived);
    assert.deepEqual(
      deriveDecodeFeedback(anomaly.clue, anomaly.answer),
      anomaly.derived,
    );
  }
  assert.equal(colorAnomalies.length, 2);
  assert.match(fixture.legacyDataAnomalies[2].issue, /exact duplicate/);
});

test("DECODE Timed difficulty advances every ten correct answers", () => {
  const boundaries = [
    [0, 4],
    [9, 4],
    [10, 5],
    [19, 5],
    [20, 6],
    [29, 6],
    [30, 7],
    [100, 7],
  ];
  for (const [score, length] of boundaries) {
    assert.equal(decodeTimedWordLength(score), length);
  }
});

test("DECODE incorrect attempts do not mutate score, timer, or progress", () => {
  const state = createDecodeState("timed");
  const snapshot = structuredClone(state);
  const result = evaluateDecodeAttempt({
    state,
    answer: "BARE",
    guess: "BAKE",
  });

  assert.equal(result.correct, false);
  assert.equal(result.reason, "incorrect");
  assert.equal(result.state, state);
  assert.deepEqual(state, snapshot);
});

test("DECODE correct Timed answers score once and reset the clock", () => {
  const state = {
    ...createDecodeState("timed"),
    score: 9,
    secondsRemaining: 3,
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
});

test("DECODE Daily 5 preserves its 4, 5, 6, 6, 7 sequence", () => {
  let state = createDecodeState("daily-5");
  const answers = ["FISH", "SQUID", "SHRIMP", "OYSTER", "LOBSTER"];

  assert.deepEqual(fixture.daily.lengths, answers.map((word) => word.length));
  for (const [index, answer] of answers.entries()) {
    const result = evaluateDecodeAttempt({ state, answer, guess: answer });
    assert.equal(result.correct, true);
    assert.equal(result.complete, index === 4);
    state = result.state;
  }

  assert.equal(state.score, 5);
  assert.equal(state.dailyIndex, 5);
  assert.equal(state.status, "complete");
});

test("DECODE clocks count down in Timed and up in Daily 5", () => {
  const timed = tickDecodeClock(createDecodeState("timed"), 20);
  assert.equal(timed.secondsRemaining, 0);
  assert.equal(timed.status, "expired");

  const daily = tickDecodeClock(createDecodeState("daily-5"), 42);
  assert.equal(daily.elapsedSeconds, 42);
  assert.equal(daily.status, "playing");
});

test("DECODE fixture locks the audited corpus size", () => {
  assert.equal(fixture.corpus.total, 119);
  assert.deepEqual(fixture.corpus.timedByLength, {
    4: 35,
    5: 27,
    6: 23,
    7: 29,
  });
  assert.equal(fixture.corpus.daily, 5);
  assert.equal(fixture.corpus.unique, 118);
});
