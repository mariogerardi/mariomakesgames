const SCORE_MIN_RARITY = -4;
const SCORE_MAX_RARITY = 3.8;
const SCORE_CONTRAST = 1.35;
const SCORE_TOP_THRESHOLD = 90;
const SCORE_TOP_MAX = 99.9999;
const RARITY_EPSILON = 1e-9;

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function applyContrast(value, amount = SCORE_CONTRAST) {
  return Math.min(1, Math.max(0, (value - 0.5) * amount + 0.5));
}

function baseScoreFromNormalized(normalized) {
  const clamped = Math.min(1, Math.max(0, normalized));
  return smoothstep(applyContrast(clamped)) * 100;
}

function computeTopStartNormalized() {
  let lo = 0;
  let hi = 1;
  for (let index = 0; index < 40; index += 1) {
    const mid = (lo + hi) / 2;
    if (baseScoreFromNormalized(mid) >= SCORE_TOP_THRESHOLD) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

const TOP_START_NORMALIZED = computeTopStartNormalized();

export function calculateRarityScore(frequency) {
  const rarity = -Math.log10(frequency + RARITY_EPSILON);
  const normalized =
    (rarity - SCORE_MIN_RARITY) /
    (SCORE_MAX_RARITY - SCORE_MIN_RARITY);
  const clamped = Math.min(1, Math.max(0, normalized));
  const baseScore = baseScoreFromNormalized(clamped);
  let scoreRaw = baseScore;

  if (baseScore > SCORE_TOP_THRESHOLD) {
    const t =
      (clamped - TOP_START_NORMALIZED) / (1 - TOP_START_NORMALIZED);
    const eased = Math.min(1, Math.max(0, t));
    scoreRaw =
      SCORE_TOP_THRESHOLD + eased * (SCORE_TOP_MAX - SCORE_TOP_THRESHOLD);
  }

  const rounded = Number(scoreRaw.toFixed(5));
  return {
    rarity,
    score: Math.min(rounded, SCORE_TOP_MAX),
  };
}

export function determineRarityTier(score) {
  if (score < 30) return 1;
  if (score < 50) return 2;
  if (score < 70) return 3;
  if (score < 90) return 4;
  if (score < 97) return 5;
  return 6;
}

export function validateRarityLocalRules(word, puzzleString) {
  if (!puzzleString) {
    return { valid: false, reason: "puzzle-loading" };
  }
  if (word.length < 4) {
    return { valid: false, reason: "too-short" };
  }
  if (!/^[a-zA-Z]+$/.test(word)) {
    return { valid: false, reason: "letters-only" };
  }
  if (!word.toLowerCase().includes(puzzleString.toLowerCase())) {
    return { valid: false, reason: "token-missing" };
  }
  return { valid: true, reason: null };
}

export function evaluateRarityAttempt({
  state,
  puzzleString,
  word,
  wordInfo,
  timestamp = "1970-01-01T00:00:00.000Z",
}) {
  if (state?.hasSubmitted) {
    return rejected("already-submitted", state);
  }

  const candidate = String(word || "").trim().toLowerCase();
  const local = validateRarityLocalRules(candidate, puzzleString);
  if (!local.valid) {
    return rejected(local.reason, state);
  }

  if (!wordInfo?.isValid) {
    return rejected("word-invalid", state);
  }

  const exactScore = Number(
    wordInfo.rarityScore ??
      wordInfo.exactScore ??
      calculateRarityScore(wordInfo.frequency).score,
  );
  const submission = {
    word: candidate,
    frequency: wordInfo.frequency,
    exactScore,
    tier: determineRarityTier(exactScore),
    timestamp,
  };
  const nextState = {
    ...state,
    hasSubmitted: true,
    submission,
  };

  return {
    accepted: true,
    reason: null,
    submission,
    state: nextState,
  };
}

export function serializeRaritySubmission(puzzleString, submission) {
  return {
    puzzleString,
    word: submission.word,
    exactScore: submission.exactScore,
    tier: submission.tier,
    frequency: submission.frequency,
    definition: submission.definition || null,
    partOfSpeech: submission.partOfSpeech || null,
    shortDefinitions: submission.shortDefinitions || [],
    allShortDefinitions: submission.allShortDefinitions || [],
    allPartsOfSpeech: submission.allPartsOfSpeech || [],
    definitionCount: Number(submission.definitionCount || 0),
    partOfSpeechCount: Number(submission.partOfSpeechCount || 0),
    definitionsByPartOfSpeech: submission.definitionsByPartOfSpeech || {},
    usageLabels: submission.usageLabels || [],
    etymology: submission.etymology || [],
    examples: submission.examples || [],
    art: submission.art || [],
    tables: submission.tables || [],
    scoreExplanation: submission.scoreExplanation || null,
    submittedAt: submission.timestamp,
  };
}

export function hydrateRaritySubmission(
  payload,
  {
    profile = {},
    fallbackTimestamp = "1970-01-01T00:00:00.000Z",
  } = {},
) {
  const exactScore = Number(
    payload.exactScore ??
      payload.rarityScore ??
      calculateRarityScore(payload.frequency).score,
  );
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    userType: profile.userType,
    word: payload.word,
    frequency: payload.frequency,
    exactScore,
    tier: determineRarityTier(exactScore),
    definition: payload.definition || null,
    partOfSpeech: payload.partOfSpeech || null,
    shortDefinitions: payload.shortDefinitions || [],
    allShortDefinitions: payload.allShortDefinitions || [],
    allPartsOfSpeech: payload.allPartsOfSpeech || [],
    definitionCount: Number(payload.definitionCount || 0),
    partOfSpeechCount: Number(payload.partOfSpeechCount || 0),
    definitionsByPartOfSpeech: payload.definitionsByPartOfSpeech || {},
    usageLabels: payload.usageLabels || [],
    etymology: payload.etymology || [],
    examples: payload.examples || [],
    art: payload.art || [],
    tables: payload.tables || [],
    scoreExplanation: payload.scoreExplanation || null,
    timestamp: payload.submittedAt || fallbackTimestamp,
  };
}

function rejected(reason, state) {
  return {
    accepted: false,
    reason,
    submission: null,
    state,
  };
}
