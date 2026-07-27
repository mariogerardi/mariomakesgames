import assert from "node:assert/strict";
import test from "node:test";
import {
  createRarityServices,
  summarizeRarityLeaderboard,
} from "../../src/games/rarity/services.mjs";

function response({ ok = true, status = 200, body }) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test("word validation keeps score and dictionary context", async () => {
  const services = createRarityServices({
    wordInfoApi: "/wordinfo",
    puzzleApi: "/puzzle",
    leaderboardApi: "/leaderboard",
    fetcher: async () =>
      response({
        body: {
          isValid: true,
          frequency: 10,
          rarityScore: 27.39053,
          definition: "A public road.",
          partOfSpeech: "noun",
          shortDefinitions: ["A public road."],
        },
      }),
  });
  const result = await services.validateWord("Street");
  assert.equal(result.isValid, true);
  assert.equal(result.frequency, 10);
  assert.equal(result.rarityScore, 27.39053);
  assert.equal(result.definition, "A public road.");
});

test("dictionary errors remain non-locking validation results", async () => {
  const services = createRarityServices({
    wordInfoApi: "/wordinfo",
    puzzleApi: "/puzzle",
    leaderboardApi: "/leaderboard",
    fetcher: async () =>
      response({
        ok: false,
        status: 400,
        body: { isValid: false, error: "not in the dictionary" },
      }),
  });
  const result = await services.validateWord("strzzzz");
  assert.equal(result.isValid, false);
  assert.equal(result.error, "not in the dictionary");
});

test("daily field summaries preserve score comparisons", () => {
  assert.deepEqual(
    summarizeRarityLeaderboard(
      [{ exactScore: 10 }, { exactScore: 30 }, { rarityScore: 50 }],
      40,
    ),
    { total: 3, percentile: 67, bestScore: 50 },
  );
  assert.deepEqual(summarizeRarityLeaderboard([], 40), {
    total: 0,
    percentile: null,
    bestScore: null,
  });
});
