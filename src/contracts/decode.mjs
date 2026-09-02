export const DECODE_FEEDBACK = Object.freeze({
  correct: "correct",
  present: "present",
  absent: "absent",
});

export function deriveDecodeFeedback(clueWord, answerWord) {
  const clue = normalizeWord(clueWord);
  const answer = normalizeWord(answerWord);
  if (clue.length !== answer.length || clue.length === 0) {
    throw new RangeError("DECODE clue and answer must have equal non-zero lengths");
  }

  const feedback = Array(clue.length).fill(DECODE_FEEDBACK.absent);
  const unmatchedAnswerCounts = new Map();

  for (let index = 0; index < clue.length; index += 1) {
    if (clue[index] === answer[index]) {
      feedback[index] = DECODE_FEEDBACK.correct;
    } else {
      unmatchedAnswerCounts.set(
        answer[index],
        (unmatchedAnswerCounts.get(answer[index]) || 0) + 1,
      );
    }
  }

  for (let index = 0; index < clue.length; index += 1) {
    if (feedback[index] === DECODE_FEEDBACK.correct) continue;
    const remaining = unmatchedAnswerCounts.get(clue[index]) || 0;
    if (remaining > 0) {
      feedback[index] = DECODE_FEEDBACK.present;
      unmatchedAnswerCounts.set(clue[index], remaining - 1);
    }
  }

  return feedback;
}

export function decodeTimedWordLength(score) {
  if (!Number.isInteger(score) || score < 0) {
    throw new RangeError("DECODE score must be a non-negative integer");
  }
  if (score < 10) return 4;
  if (score < 20) return 5;
  if (score < 30) return 6;
  return 7;
}

export function createDecodeState(mode) {
  if (mode === "timed") {
    return {
      mode,
      status: "playing",
      score: 0,
      secondsRemaining: 20,
    };
  }
  if (mode === "daily-5") {
    return {
      mode,
      status: "playing",
      score: 0,
      dailyIndex: 0,
      elapsedSeconds: 0,
    };
  }
  if (mode === "zen") {
    return {
      mode,
      status: "playing",
      score: 0,
    };
  }
  throw new RangeError(`Unsupported DECODE mode: ${mode}`);
}

export function evaluateDecodeAttempt({ state, answer, guess }) {
  if (state?.status !== "playing") {
    return rejectedDecodeAttempt("not-active", state);
  }

  const candidate = normalizeWord(guess);
  const expected = normalizeWord(answer);
  if (candidate !== expected) {
    return rejectedDecodeAttempt("incorrect", state);
  }

  if (state.mode === "timed") {
    const score = state.score + 1;
    const nextState = {
      ...state,
      score,
      secondsRemaining: 20,
    };
    return {
      correct: true,
      reason: null,
      complete: false,
      nextWordLength: decodeTimedWordLength(score),
      state: nextState,
    };
  }

  if (state.mode === "daily-5") {
    const dailyIndex = state.dailyIndex + 1;
    const complete = dailyIndex === 5;
    const nextState = {
      ...state,
      score: state.score + 1,
      dailyIndex,
      status: complete ? "complete" : "playing",
    };
    return {
      correct: true,
      reason: null,
      complete,
      nextWordLength: complete ? null : [4, 5, 6, 6, 7][dailyIndex],
      state: nextState,
    };
  }

  if (state.mode === "zen") {
    return {
      correct: true,
      reason: null,
      complete: false,
      nextWordLength: 4,
      state: {
        ...state,
        score: state.score + 1,
      },
    };
  }

  throw new RangeError(`Unsupported DECODE mode: ${state.mode}`);
}

export function tickDecodeClock(state, seconds = 1) {
  if (state?.status !== "playing") return state;
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError("DECODE clock ticks must be non-negative integers");
  }

  if (state.mode === "timed") {
    const secondsRemaining = Math.max(0, state.secondsRemaining - seconds);
    return {
      ...state,
      secondsRemaining,
      status: secondsRemaining === 0 ? "expired" : "playing",
    };
  }
  if (state.mode === "daily-5") {
    return {
      ...state,
      elapsedSeconds: state.elapsedSeconds + seconds,
    };
  }
  if (state.mode === "zen") return state;
  throw new RangeError(`Unsupported DECODE mode: ${state.mode}`);
}

function rejectedDecodeAttempt(reason, state) {
  return {
    correct: false,
    reason,
    complete: false,
    nextWordLength: null,
    state,
  };
}

function normalizeWord(value) {
  return String(value || "").trim().toUpperCase();
}
