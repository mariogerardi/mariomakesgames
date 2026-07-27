import assert from "node:assert/strict";
import test from "node:test";
import {
  applyExpl41nGuess,
  attemptsRemaining,
  createExpl41nSession,
  expl41nAvatarMood,
  hydrateExpl41nSession,
  serializeExpl41nSession,
  validateExpl41nClue,
  validateExpl41nCustomWord,
} from "../../src/games/expl41n/engine.mjs";

const puzzle = {
  word: "Lantern",
  date: "February 15, 2026",
  funFact: "Lantern fact.",
};

test("Expl41n clues preserve the 25-character boundary", () => {
  assert.equal(validateExpl41nClue("").reason, "empty");
  assert.equal(validateExpl41nClue("x".repeat(25)).valid, true);
  assert.equal(validateExpl41nClue("x".repeat(26)).reason, "too-long");
});

test("Expl41n custom challenges require one word and normalize casing", () => {
  assert.equal(validateExpl41nCustomWord("two words").reason, "spaces");
  assert.deepEqual(validateExpl41nCustomWord("lAnTeRn"), {
    valid: true,
    reason: null,
    word: "Lantern",
  });
});

test("Expl41n rejected clues do not mutate the session", () => {
  const session = createExpl41nSession({
    puzzle,
    mode: "daily",
    sessionDate: "2026-02-15",
  });
  const result = applyExpl41nGuess(session, {
    clue: " ",
    response: {
      guess: "Lantern",
      confidence: 100,
      searchSpace: 1,
      reasoning: "Obvious.",
    },
    timestamp: "2026-02-15T12:00:00.000Z",
  });
  assert.equal(result.accepted, false);
  assert.equal(result.state, session);
  assert.equal(session.attempts.length, 0);
});

test("Expl41n Daily loses after exactly five incorrect guesses", () => {
  let session = createExpl41nSession({
    puzzle,
    mode: "daily",
    sessionDate: "2026-02-15",
  });
  for (let index = 0; index < 5; index += 1) {
    const result = applyExpl41nGuess(session, {
      clue: `clue ${index}`,
      response: {
        guess: `Wrong${index}`,
        confidence: 40,
        searchSpace: 60,
        reasoning: "Trying.",
      },
      timestamp: `2026-02-15T12:00:0${index}.000Z`,
    });
    session = result.state;
  }
  assert.equal(session.status, "lost");
  assert.equal(attemptsRemaining(session), 0);
});

test("Expl41n locks the first successful clue and scores its length", () => {
  const session = createExpl41nSession({
    puzzle,
    mode: "daily",
    sessionDate: "2026-02-15",
  });
  const result = applyExpl41nGuess(session, {
    clue: "festival light",
    response: {
      guess: "Lantern",
      confidence: 95,
      searchSpace: 1,
      reasoning: "That points directly to a lantern.",
    },
    timestamp: "2026-02-15T12:00:00.000Z",
  });
  assert.equal(result.won, true);
  assert.equal(result.state.status, "won");
  assert.equal(result.state.winningAttempt.characters, 14);

  const replay = applyExpl41nGuess(result.state, {
    clue: "lamp",
    response: {
      guess: "Lantern",
      confidence: 100,
      searchSpace: 1,
      reasoning: "Another win.",
    },
    timestamp: "2026-02-15T12:01:00.000Z",
  });
  assert.equal(replay.accepted, false);
  assert.equal(replay.state.attempts.length, 1);
});

test("Expl41n non-Daily modes retain unlimited attempts", () => {
  let session = createExpl41nSession({
    puzzle,
    mode: "shuffle",
    sessionDate: "shuffle-1",
  });
  for (let index = 0; index < 8; index += 1) {
    session = applyExpl41nGuess(session, {
      clue: `clue ${index}`,
      response: {
        guess: "Wrong",
        confidence: 20,
        searchSpace: 80,
        reasoning: "Still trying.",
      },
      timestamp: `2026-02-15T12:00:${index}0.000Z`,
    }).state;
  }
  assert.equal(session.status, "active");
  assert.equal(attemptsRemaining(session), Number.POSITIVE_INFINITY);
});

test("Expl41n hydration restores only the matching daily puzzle", () => {
  const session = createExpl41nSession({
    puzzle,
    mode: "daily",
    sessionDate: "2026-02-15",
  });
  const won = applyExpl41nGuess(session, {
    clue: "festival light",
    response: {
      guess: "Lantern",
      confidence: 95,
      searchSpace: 1,
      reasoning: "Clear.",
    },
    timestamp: "2026-02-15T12:00:00.000Z",
  }).state;
  const payload = serializeExpl41nSession(won);
  assert.equal(
    hydrateExpl41nSession({
      payload,
      puzzle,
      mode: "daily",
      sessionDate: "2026-02-15",
    }).status,
    "won",
  );
  assert.equal(
    hydrateExpl41nSession({
      payload,
      puzzle: { ...puzzle, word: "Fire" },
      mode: "daily",
      sessionDate: "2026-02-16",
    }).status,
    "active",
  );
});

test("Expl41n avatar moods preserve confidence thresholds", () => {
  assert.equal(expl41nAvatarMood(10), "angry");
  assert.equal(expl41nAvatarMood(30), "confused");
  assert.equal(expl41nAvatarMood(50), "suspicious");
  assert.equal(expl41nAvatarMood(60), "side-eye");
  assert.equal(expl41nAvatarMood(80), "happy");
  assert.equal(expl41nAvatarMood(81), "surprised");
  assert.equal(expl41nAvatarMood(50, "won"), "victory");
});
