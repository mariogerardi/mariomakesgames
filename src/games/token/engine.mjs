import {
  normalizeTokenValue,
  tokenizePrototypeEntry,
  validateTokenEntry,
} from "./tokenizer.mjs";

export const TOKEN_PHASES = Object.freeze({
  LOADING: "loading",
  GENERATING: "generating",
  PREDICTING: "predicting",
  REVEAL_EXACT: "reveal-exact",
  REVEAL_MISS: "reveal-miss",
  COMPLETE: "complete",
  RESULTS: "results",
  INSPECTION: "inspection",
});

const TRANSITIONS = Object.freeze({
  loading: ["generating"],
  generating: ["predicting", "complete"],
  predicting: ["reveal-exact", "reveal-miss"],
  "reveal-exact": ["generating", "complete"],
  "reveal-miss": ["generating", "complete"],
  complete: ["results", "inspection"],
  results: ["complete"],
  inspection: ["complete"],
});

export function transitionTokenRun(run, phase) {
  if (!TRANSITIONS[run.phase]?.includes(phase)) {
    throw new Error(`Invalid TOKEN transition: ${run.phase} → ${phase}`);
  }
  return { ...run, phase };
}

export function createTokenRun(puzzle) {
  return {
    puzzleId: puzzle.id,
    phase: TOKEN_PHASES.LOADING,
    cursor: 0,
    stopCursor: 0,
    submissions: [],
    completed: false,
  };
}

export function findTokenCandidate(stop, token) {
  const normalized = normalizeTokenValue(token);
  return stop.candidates.find((candidate) => normalizeTokenValue(candidate.token) === normalized) ?? null;
}

export function scoreTokenEntry(stop, rawEntry, entryLimit) {
  const validated = validateTokenEntry(rawEntry, entryLimit);
  if (!validated.valid) return { accepted: false, ...validated };

  const tokens = tokenizePrototypeEntry(validated.entry);
  const firstToken = tokens[0] ?? "";
  const firstIsCanonical = normalizeTokenValue(firstToken) === normalizeTokenValue(stop.token);
  const exact = tokens.length === 1 && firstIsCanonical;
  const candidate = firstIsCanonical ? null : findTokenCandidate(stop, firstToken);
  const baseScore = firstIsCanonical ? 100 : candidate?.score ?? 0;
  const score = baseScore / Math.max(tokens.length, 1);
  return {
    accepted: true,
    entry: validated.entry,
    tokenized: tokens,
    firstToken,
    exact,
    score,
    status: tokenScoreStatus(score),
  };
}

export function tokenScoreStatus(score) {
  if (score >= 100) return "exact";
  if (score >= 70) return "ok";
  if (score >= 20) return "warn";
  return "crit";
}

export function averageTokenScore(submissions) {
  if (!submissions.length) return 0;
  return submissions.reduce((total, submission) => total + submission.score, 0) / submissions.length;
}

export function serializeTokenRun(run) {
  return JSON.stringify({ schemaVersion: 1, ...run });
}

export function hydrateTokenRun(value, puzzle) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || parsed.schemaVersion !== 1 || parsed.puzzleId !== puzzle.id) return null;
    if (!Array.isArray(parsed.submissions) || !Number.isInteger(parsed.cursor) || !Number.isInteger(parsed.stopCursor)) return null;
    return {
      puzzleId: puzzle.id,
      phase: parsed.completed ? TOKEN_PHASES.COMPLETE : TOKEN_PHASES.GENERATING,
      cursor: Math.max(0, Math.min(puzzle.responseTokens.length, parsed.cursor)),
      stopCursor: Math.max(0, Math.min(puzzle.stops.length, parsed.stopCursor)),
      submissions: parsed.submissions,
      completed: Boolean(parsed.completed),
    };
  } catch {
    return null;
  }
}
