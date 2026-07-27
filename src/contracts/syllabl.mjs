export const SYLLABL_STAGE_COUNT = 6;

export function validateSyllablPlacement(word, puzzleLetters, placementRule) {
  const candidate = String(word || "").toLowerCase();
  const token = String(puzzleLetters || "").toLowerCase();

  switch (Number(placementRule)) {
    case 1:
      return candidate.endsWith(token);
    case 2:
      return candidate.startsWith(token);
    case 3:
      return (
        candidate.includes(token) &&
        !candidate.startsWith(token) &&
        !candidate.endsWith(token)
      );
    case 4:
      return candidate.startsWith(token) && candidate.endsWith(token);
    default:
      return false;
  }
}

export function scoreSyllablFrequency(frequency) {
  if (frequency >= 100) return 1;
  if (frequency >= 10) return 2;
  if (frequency >= 1) return 3;
  if (frequency >= 0.1) return 4;
  return 5;
}

export function evaluateSyllablAttempt({ state, word, wordInfo }) {
  if (!state?.puzzle) {
    return rejected("puzzle-missing", state);
  }

  if (state.currentStage >= SYLLABL_STAGE_COUNT) {
    return rejected("already-complete", state);
  }

  const candidate = String(word || "").trim().toLowerCase();
  if (candidate.length < 4) {
    return rejected("too-short", state);
  }

  const placementRule = state.puzzle.inputsEnabled[state.currentStage];
  const requiredSyllables =
    state.puzzle.syllablesRequired[state.currentStage];

  if (
    !validateSyllablPlacement(
      candidate,
      state.puzzle.puzzleLetters,
      placementRule,
    )
  ) {
    return rejected("placement", state);
  }

  if (!wordInfo?.isValid) {
    return rejected("word-invalid", state);
  }

  const matchingParse = wordInfo.syllableParses?.find(
    (parse) => parse.count === requiredSyllables,
  );
  if (!matchingParse) {
    return rejected("syllable-count", state);
  }

  const wordScore = scoreSyllablFrequency(wordInfo.frequency);
  const guess = {
    word: candidate,
    score: wordScore,
    syllables: matchingParse.count,
    frequency: wordInfo.frequency,
    syllableList: [...(matchingParse.syllables || [])],
  };
  const nextStage = state.currentStage + 1;
  const nextState = {
    ...state,
    currentStage: nextStage,
    score: state.score + wordScore,
    guesses: [...state.guesses, guess],
  };

  return {
    accepted: true,
    reason: null,
    guess,
    state: nextState,
    complete: nextStage >= SYLLABL_STAGE_COUNT,
  };
}

function rejected(reason, state) {
  return {
    accepted: false,
    reason,
    guess: null,
    state,
    complete: Boolean(state?.currentStage >= SYLLABL_STAGE_COUNT),
  };
}
