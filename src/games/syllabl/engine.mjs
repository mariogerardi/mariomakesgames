export const SYLLABL_STAGE_COUNT = 6;
export const SYLLABL_SESSION_SCHEMA_VERSION = 2;

function normalizeWord(word) {
  return typeof word === "string" ? word.trim().toLowerCase() : "";
}

export function validateSyllablPlacement(word, puzzleLetters, placementCode) {
  const candidate = normalizeWord(word);
  const token = normalizeWord(puzzleLetters);
  const begins = candidate.startsWith(token);
  const ends = candidate.endsWith(token);

  if (!token) return false;
  if (placementCode === 1) return ends;
  if (placementCode === 2) return begins;
  if (placementCode === 3) {
    return candidate.includes(token) && !begins && !ends;
  }
  if (placementCode === 4) return begins && ends;
  return false;
}

export function createSyllablSession({
  puzzle,
  puzzleDate,
  mode = "daily",
}) {
  return {
    schemaVersion: SYLLABL_SESSION_SCHEMA_VERSION,
    puzzle,
    puzzleDate,
    mode,
    currentStage: 0,
    guesses: [],
    status: "in-progress",
  };
}

export function getSyllablConstraint(session) {
  if (!session?.puzzle || session.currentStage >= SYLLABL_STAGE_COUNT) {
    return null;
  }

  return {
    placementCode: session.puzzle.inputsEnabled[session.currentStage],
    syllablesRequired: session.puzzle.syllablesRequired[session.currentStage],
  };
}

export function evaluateSyllablAttempt({ session, word, wordInfo }) {
  if (!session?.puzzle) {
    return { accepted: false, reason: "puzzle-missing", session };
  }
  if (
    session.status === "complete" ||
    session.currentStage >= SYLLABL_STAGE_COUNT
  ) {
    return { accepted: false, reason: "already-complete", session };
  }

  const candidate = normalizeWord(word);
  if (candidate.length < 4) {
    return { accepted: false, reason: "too-short", session };
  }

  const constraint = getSyllablConstraint(session);
  if (
    !constraint ||
    !validateSyllablPlacement(
      candidate,
      session.puzzle.puzzleLetters,
      constraint.placementCode,
    )
  ) {
    return { accepted: false, reason: "placement", session };
  }

  if (!wordInfo?.isValid) {
    return { accepted: false, reason: "word-invalid", session };
  }

  const matchingParse = wordInfo.syllableParses?.find(
    (parse) => parse.count === constraint.syllablesRequired,
  );
  if (!matchingParse) {
    return { accepted: false, reason: "syllable-count", session };
  }

  const nextStage = session.currentStage + 1;
  const guess = {
    word: candidate,
    syllables: matchingParse.count,
    syllableList: matchingParse.syllables ?? wordInfo.syllableList ?? [],
  };
  const nextSession = {
    ...session,
    currentStage: nextStage,
    guesses: [...session.guesses, guess],
    status:
      nextStage === SYLLABL_STAGE_COUNT ? "complete" : "in-progress",
  };

  return { accepted: true, reason: "accepted", guess, session: nextSession };
}

export function serializeSyllablSession(session) {
  return {
    schemaVersion: SYLLABL_SESSION_SCHEMA_VERSION,
    puzzleDate: session.puzzleDate,
    puzzleLetters: session.puzzle.puzzleLetters,
    currentStage: session.currentStage,
    guesses: session.guesses.map(({ word, syllables, syllableList }) => ({
      word,
      syllables,
      syllableList,
    })),
    status: session.status,
  };
}

function migrateGuess(guess) {
  if (!guess || typeof guess.word !== "string") return null;
  return {
    word: normalizeWord(guess.word),
    syllables: Number(guess.syllables),
    syllableList: Array.isArray(guess.syllableList)
      ? [...guess.syllableList]
      : [],
  };
}

export function hydrateSyllablSession({
  stored,
  puzzle,
  puzzleDate,
  mode = "daily",
}) {
  const fresh = createSyllablSession({ puzzle, puzzleDate, mode });
  if (
    !stored ||
    stored.puzzleDate !== puzzleDate ||
    normalizeWord(stored.puzzleLetters) !== puzzle.puzzleLetters
  ) {
    return fresh;
  }

  const guesses = Array.isArray(stored.guesses)
    ? stored.guesses.map(migrateGuess).filter(Boolean).slice(0, 6)
    : [];
  const requestedStage = Number.isInteger(stored.currentStage)
    ? stored.currentStage
    : guesses.length;
  const currentStage = Math.max(
    0,
    Math.min(SYLLABL_STAGE_COUNT, requestedStage, guesses.length),
  );

  return {
    ...fresh,
    currentStage,
    guesses: guesses.slice(0, currentStage),
    status:
      currentStage === SYLLABL_STAGE_COUNT ? "complete" : "in-progress",
  };
}

export function syllablDailyStorageKey(dateKey) {
  return `mg-games:v2:syllabl:daily-${dateKey}`;
}
