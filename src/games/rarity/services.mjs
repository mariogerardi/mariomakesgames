import { normalizeLiveRarityPuzzle } from "./puzzle-loader.mjs";

function normalizeWordInfo(payload) {
  const frequency = Number(payload?.frequency);
  const exactScore = Number(payload?.rarityScore ?? payload?.exactScore);
  return {
    isValid: Boolean(payload?.isValid) && Number.isFinite(frequency),
    frequency,
    rarityScore: Number.isFinite(exactScore) ? exactScore : undefined,
    definition:
      typeof payload?.definition === "string" ? payload.definition : null,
    partOfSpeech:
      typeof payload?.partOfSpeech === "string" ? payload.partOfSpeech : null,
    shortDefinitions: Array.isArray(payload?.shortDefinitions)
      ? [...payload.shortDefinitions]
      : [],
    allShortDefinitions: Array.isArray(payload?.allShortDefinitions)
      ? [...payload.allShortDefinitions]
      : [],
    allPartsOfSpeech: Array.isArray(payload?.allPartsOfSpeech)
      ? [...payload.allPartsOfSpeech]
      : [],
    definitionCount: Number(payload?.definitionCount ?? 0),
    partOfSpeechCount: Number(payload?.partOfSpeechCount ?? 0),
    definitionsByPartOfSpeech:
      payload?.definitionsByPartOfSpeech &&
      typeof payload.definitionsByPartOfSpeech === "object"
        ? payload.definitionsByPartOfSpeech
        : {},
    usageLabels: Array.isArray(payload?.usageLabels)
      ? [...payload.usageLabels]
      : [],
    etymology: Array.isArray(payload?.etymology)
      ? [...payload.etymology]
      : [],
    examples: Array.isArray(payload?.examples) ? [...payload.examples] : [],
    scoreExplanation:
      typeof payload?.scoreExplanation === "string"
        ? payload.scoreExplanation
        : null,
    error: typeof payload?.error === "string" ? payload.error : null,
  };
}

async function readJson(response) {
  return response.json().catch(() => null);
}

export function createRarityServices({
  fetcher,
  wordInfoApi,
  puzzleApi,
  leaderboardApi,
}) {
  async function validateWord(word) {
    const response = await fetcher(
      `${wordInfoApi}?word=${encodeURIComponent(word.trim().toLowerCase())}`,
    );
    const payload = await readJson(response);
    if (!response.ok) {
      return normalizeWordInfo({
        ...payload,
        isValid: false,
        error:
          payload?.error ??
          (response.status >= 500 ? "word-service-unavailable" : null),
      });
    }
    return normalizeWordInfo(payload);
  }

  async function fetchDailyPuzzle(dateKey) {
    const response = await fetcher(
      `${puzzleApi}?date=${encodeURIComponent(dateKey)}`,
    );
    if (!response.ok) return null;
    return normalizeLiveRarityPuzzle(await readJson(response), dateKey);
  }

  async function submitDailyResult(payload) {
    const response = await fetcher(leaderboardApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  }

  async function fetchDailyLeaderboard(dateKey) {
    const response = await fetcher(
      `${leaderboardApi}?puzzleDate=${encodeURIComponent(dateKey)}`,
    );
    if (!response.ok) return [];
    const payload = await readJson(response);
    return Array.isArray(payload?.entries) ? payload.entries : [];
  }

  return Object.freeze({
    validateWord,
    fetchDailyPuzzle,
    submitDailyResult,
    fetchDailyLeaderboard,
  });
}

export function summarizeRarityLeaderboard(entries, playerScore) {
  const scores = entries
    .map((entry) => Number(entry?.exactScore ?? entry?.rarityScore))
    .filter(Number.isFinite);
  if (scores.length === 0) {
    return { total: 0, percentile: null, bestScore: null };
  }
  const below = scores.filter((score) => score < playerScore).length;
  return {
    total: scores.length,
    percentile: Math.round((below / scores.length) * 100),
    bestScore: Math.max(...scores),
  };
}
