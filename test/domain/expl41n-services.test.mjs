import assert from "node:assert/strict";
import test from "node:test";
import {
  createExpl41nServices,
  normalizeGuess,
} from "../../src/games/expl41n/services.mjs";

test("Expl41n normalizes AI metrics into their 0–100 range", () => {
  assert.deepEqual(
    normalizeGuess({
      guess: "Lantern",
      confidence: 105,
      searchSpace: -4,
      reasoning: "Clear.",
    }),
    {
      guess: "Lantern",
      confidence: 100,
      searchSpace: 0,
      reasoning: "Clear.",
    },
  );
});

test("Expl41n sends current and previous clue context to the legacy guesser", async () => {
  let request;
  const services = createExpl41nServices({
    fetcher: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            guess: "Lantern",
            confidence: 95,
            searchSpace: 1,
            reasoning: "Clear.",
          }),
      };
    },
    guessApi: "https://example.test/guess",
  });
  await services.guess({
    clue: "festival light",
    previousAIGuesses: ["candle"],
    previousClues: ["candle holder", "festival light"],
  });
  assert.equal(request.url, "https://example.test/guess");
  assert.deepEqual(JSON.parse(request.options.body), {
    clue: "festival light",
    previousAIGuesses: ["candle"],
    previousClues: ["candle holder", "festival light"],
  });
});
