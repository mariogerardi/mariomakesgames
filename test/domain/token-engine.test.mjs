import assert from "node:assert/strict";
import test from "node:test";
import {
  TOKEN_PHASES,
  averageTokenScore,
  createTokenRun,
  findTokenCandidate,
  hydrateTokenRun,
  scoreTokenEntry,
  serializeTokenRun,
  transitionTokenRun,
} from "../../src/games/token/engine.mjs";
import { TOKEN_ENTRY_LIMIT, limitTokenEntry, validateTokenEntry } from "../../src/games/token/tokenizer.mjs";

const puzzle = {
  id: "fixture",
  responseTokens: ["The", "café", "opens"],
  stops: [{ index: 1, token: "café", candidates: [
    { token: "coffee", score: 82 },
    { token: "shop", score: 58 },
    { token: "restaurant", score: 22 },
    { token: "bar", score: 18 },
    { token: "store", score: 12 },
  ] }],
};

const stop = puzzle.stops[0];

test("TOKEN accepts exact entries case-insensitively but preserves accents", () => {
  const exact = scoreTokenEntry(stop, "  CAFÉ  ");
  const accentMiss = scoreTokenEntry(stop, "cafe");
  assert.equal(exact.accepted, true);
  assert.equal(exact.exact, true);
  assert.equal(exact.score, 100);
  assert.equal(exact.entry, "CAFÉ");
  assert.equal(accentMiss.accepted, true);
  assert.equal(accentMiss.exact, false);
  assert.equal(accentMiss.score, 0);
});

test("TOKEN trims entries, rejects blank entries, and caps UI text at twelve characters", () => {
  assert.deepEqual(validateTokenEntry("   "), { valid: false, entry: "", reason: "empty" });
  assert.equal(TOKEN_ENTRY_LIMIT, 12);
  assert.equal(limitTokenEntry("123456789012345"), "123456789012");
  assert.equal(validateTokenEntry("1234567890123").reason, "limit");
});

test("TOKEN finds stored candidates and gives unknown entries no score", () => {
  assert.deepEqual(findTokenCandidate(stop, "COFFEE"), { token: "coffee", score: 82 });
  const candidate = scoreTokenEntry(stop, "coffee");
  const unknown = scoreTokenEntry(stop, "library");
  assert.equal(candidate.score, 82);
  assert.equal(candidate.status, "ok");
  assert.equal(unknown.score, 0);
  assert.equal(unknown.status, "crit");
});

test("TOKEN divides the first-token score for multi-token entries and reserves exact for one token", () => {
  const multiple = scoreTokenEntry(stop, "coffee shop");
  const canonicalMultiple = scoreTokenEntry(stop, "café noir");
  assert.deepEqual(multiple.tokenized, ["coffee", "shop"]);
  assert.equal(multiple.score, 41);
  assert.equal(multiple.exact, false);
  assert.equal(canonicalMultiple.score, 50);
  assert.equal(canonicalMultiple.exact, false);
});

test("TOKEN averages submitted prediction scores", () => {
  assert.equal(averageTokenScore([]), 0);
  assert.equal(averageTokenScore([{ score: 100 }, { score: 82 }, { score: 0 }]), 182 / 3);
});

test("TOKEN state transitions only follow the game loop", () => {
  const run = createTokenRun(puzzle);
  const generating = transitionTokenRun(run, TOKEN_PHASES.GENERATING);
  const predicting = transitionTokenRun(generating, TOKEN_PHASES.PREDICTING);
  const reveal = transitionTokenRun(predicting, TOKEN_PHASES.REVEAL_EXACT);
  assert.equal(reveal.phase, TOKEN_PHASES.REVEAL_EXACT);
  assert.throws(() => transitionTokenRun(run, TOKEN_PHASES.RESULTS), /Invalid TOKEN transition/);
});

test("TOKEN serializes and restores only matching puzzle progress", () => {
  const stored = serializeTokenRun({
    puzzleId: puzzle.id,
    phase: TOKEN_PHASES.GENERATING,
    cursor: 2,
    stopCursor: 1,
    submissions: [{ score: 82 }],
    completed: false,
  });
  const restored = hydrateTokenRun(stored, puzzle);
  assert.equal(restored.cursor, 2);
  assert.equal(restored.stopCursor, 1);
  assert.equal(restored.phase, TOKEN_PHASES.GENERATING);
  assert.equal(hydrateTokenRun(stored, { ...puzzle, id: "other" }), null);
  assert.equal(hydrateTokenRun("{", puzzle), null);
});
