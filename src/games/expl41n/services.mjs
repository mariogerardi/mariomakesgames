const DEFAULT_GUESS_API =
  "https://ewrn400smd.execute-api.us-east-1.amazonaws.com/guess";
const DEFAULT_SCORE_API =
  "https://xrwraeaoa5.execute-api.us-east-1.amazonaws.com";

export function createExpl41nServices({
  fetcher = fetch,
  guessApi = DEFAULT_GUESS_API,
  scoreApi = DEFAULT_SCORE_API,
} = {}) {
  return {
    async guess({ clue, previousAIGuesses, previousClues }) {
      const response = await fetcher(guessApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clue, previousAIGuesses, previousClues }),
      });
      if (!response.ok) throw new Error(`guess-service-${response.status}`);
      const raw = await response.text();
      const value = JSON.parse(raw);
      return normalizeGuess(value);
    },
    async submitScore({ username, score, clue }) {
      const response = await fetcher(`${scoreApi}/submit-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: username,
          username,
          score,
          clue,
        }),
      });
      if (!response.ok) throw new Error(`score-service-${response.status}`);
      return response.json();
    },
    async leaderboard(username) {
      const response = await fetcher(
        `${scoreApi}/leaderboard?player_id=${encodeURIComponent(username)}`,
      );
      if (!response.ok) {
        throw new Error(`leaderboard-service-${response.status}`);
      }
      const values = await response.json();
      if (!Array.isArray(values)) return [];
      return values
        .filter(
          (entry) =>
            entry &&
            typeof entry.username === "string" &&
            Number.isFinite(Number(entry.score)),
        )
        .map((entry) => ({
          username: entry.username,
          score: Number(entry.score),
          clue: typeof entry.clue === "string" ? entry.clue : "???",
        }))
        .sort((a, b) => a.score - b.score);
    },
  };
}

export function normalizeGuess(value) {
  if (!value || typeof value !== "object") {
    throw new Error("invalid-guess-response");
  }
  const guess = String(value.guess || "").trim();
  if (!guess) throw new Error("invalid-guess-response");
  return {
    guess,
    confidence: clamp(value.confidence, 25),
    searchSpace: clamp(value.searchSpace, 100),
    reasoning:
      String(value.reasoning || "").trim() ||
      "I am having trouble making the connection.",
  };
}

function clamp(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}
