import {
  calculateRarityScore,
  determineRarityTier,
  evaluateRarityAttempt as evaluateContractAttempt,
  hydrateRaritySubmission,
  serializeRaritySubmission,
  validateRarityLocalRules,
} from "../../contracts/rarity.mjs";

export {
  calculateRarityScore,
  determineRarityTier,
  serializeRaritySubmission,
  validateRarityLocalRules,
};

export const RARITY_TIER_LABELS = Object.freeze({
  1: "Very common",
  2: "Common",
  3: "Uncommon",
  4: "Rare",
  5: "Ultra rare",
  6: "Legendary",
});

export function createRaritySession({ puzzle, puzzleDate }) {
  return {
    schemaVersion: 1,
    puzzle,
    puzzleDate,
    hasSubmitted: false,
    submission: null,
  };
}

export function evaluateRarityAttempt(input) {
  const result = evaluateContractAttempt(input);
  if (!result.accepted) return result;

  const metadata = input.wordInfo ?? {};
  const submission = {
    ...result.submission,
    definition: metadata.definition || null,
    partOfSpeech: metadata.partOfSpeech || null,
    shortDefinitions: metadata.shortDefinitions || [],
    allShortDefinitions: metadata.allShortDefinitions || [],
    allPartsOfSpeech: metadata.allPartsOfSpeech || [],
    definitionCount: Number(metadata.definitionCount || 0),
    partOfSpeechCount: Number(metadata.partOfSpeechCount || 0),
    definitionsByPartOfSpeech: metadata.definitionsByPartOfSpeech || {},
    usageLabels: metadata.usageLabels || [],
    etymology: metadata.etymology || [],
    examples: metadata.examples || [],
    scoreExplanation: metadata.scoreExplanation || null,
  };

  return {
    ...result,
    submission,
    state: { ...result.state, submission },
  };
}

export function hydrateRaritySession({ payload, puzzle, puzzleDate }) {
  const fresh = createRaritySession({ puzzle, puzzleDate });
  if (!payload || typeof payload.word !== "string") return fresh;
  if (
    payload.puzzleString &&
    payload.puzzleString.toLowerCase() !== puzzle.puzzleString.toLowerCase()
  ) {
    return fresh;
  }
  const submission = hydrateRaritySubmission(payload);
  if (
    typeof submission.word !== "string" ||
    !Number.isFinite(submission.frequency) ||
    !Number.isFinite(submission.exactScore)
  ) {
    return fresh;
  }
  return {
    ...fresh,
    hasSubmitted: true,
    submission,
  };
}

export function rarityDailyStorageKey(dateKey) {
  return `rarity_daily_${dateKey}`;
}

export function formatRarityScore(score, decimals = 4) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "—";
  const maximum = Math.min(99.9999, 100 - 10 ** -decimals);
  return Math.min(numeric, maximum).toFixed(decimals);
}
