export const BEFORE_AFTER_ANSWER_LIMIT = 15;
export const BEFORE_AFTER_DAILY_SECONDS = 60;

export function normalizeBridgeAnswer(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function createBridgeSession({ puzzle, mode, startedAt = Date.now() }) {
  return {
    version: 1,
    puzzle,
    mode,
    answerText: "",
    attempts: 0,
    status: "active",
    startedAt,
    completedAt: null,
    durationMs: null,
  };
}

export function submitBridgeAnswer(session, answer, now = Date.now()) {
  if (session.status !== "active") {
    return { accepted: false, correct: session.status === "solved", state: session };
  }
  if (
    session.mode === "daily" &&
    now - session.startedAt >= BEFORE_AFTER_DAILY_SECONDS * 1000
  ) {
    return {
      accepted: false,
      correct: false,
      state: expireBridgeSession(session, now),
    };
  }
  const normalized = normalizeBridgeAnswer(answer);
  if (!normalized) {
    return { accepted: false, correct: false, state: session };
  }
  const correct =
    normalized === normalizeBridgeAnswer(session.puzzle.answer);
  const attempts = session.attempts + 1;
  const state = {
    ...session,
    answerText: correct ? session.puzzle.answer.toLowerCase() : normalized,
    attempts,
    status: correct ? "solved" : "active",
    completedAt: correct ? now : null,
    durationMs: correct ? Math.max(0, now - session.startedAt) : null,
  };
  return { accepted: true, correct, state };
}

export function expireBridgeSession(session, now = Date.now()) {
  if (session.status !== "active" || session.mode !== "daily") return session;
  return {
    ...session,
    status: "expired",
    completedAt: now,
    durationMs: Math.max(0, now - session.startedAt),
  };
}

export function remainingBridgeSeconds(session, now = Date.now()) {
  if (session.mode !== "daily") return Number.POSITIVE_INFINITY;
  const elapsed = Math.floor(Math.max(0, now - session.startedAt) / 1000);
  return Math.max(0, BEFORE_AFTER_DAILY_SECONDS - elapsed);
}

export function bridgePhrases(puzzle, answer = puzzle.answer) {
  const [first = "", second = first] = puzzle.clueWords;
  const bridge = normalizeBridgeAnswer(answer);
  if (puzzle.position === "before") {
    return [`${bridge} ${first}`, `${bridge} ${second}`];
  }
  if (puzzle.position === "after") {
    return [`${first} ${bridge}`, `${second} ${bridge}`];
  }
  return [`${bridge} ${first}`, `${second} ${bridge}`];
}

export function validateCustomBridgePuzzle({
  answer,
  clueOne,
  clueTwo,
  position,
}) {
  const normalizedAnswer = String(answer ?? "").trim();
  const clues = [clueOne, clueTwo].map((value) => String(value ?? "").trim());
  if (!normalizedAnswer) return { valid: false, reason: "answer-required" };
  if (normalizedAnswer.length > BEFORE_AFTER_ANSWER_LIMIT) {
    return { valid: false, reason: "answer-too-long" };
  }
  if (clues.some((clue) => !clue)) {
    return { valid: false, reason: "two-clues-required" };
  }
  if (new Set(clues.map((clue) => clue.toLowerCase())).size !== 2) {
    return { valid: false, reason: "clues-unique" };
  }
  if (!["before", "after", "both"].includes(position)) {
    return { valid: false, reason: "position-invalid" };
  }
  return {
    valid: true,
    reason: null,
    puzzle: {
      id: `custom-${Date.now()}`,
      clueWords: clues,
      position,
      answer: normalizedAnswer,
      difficulty: 1,
    },
  };
}

export function hydrateBridgeSession({ payload, puzzle, mode, now = Date.now() }) {
  const fresh = createBridgeSession({ puzzle, mode, startedAt: now });
  if (!payload || typeof payload !== "object") return fresh;
  if (
    payload.puzzleId !== puzzle.id ||
    payload.mode !== mode ||
    !Number.isFinite(payload.startedAt)
  ) {
    return fresh;
  }
  const status = ["active", "solved", "expired"].includes(payload.status)
    ? payload.status
    : "active";
  const session = {
    ...fresh,
    answerText: typeof payload.answerText === "string" ? payload.answerText : "",
    attempts: Math.max(0, Number(payload.attempts) || 0),
    status,
    startedAt: payload.startedAt,
    completedAt: Number.isFinite(payload.completedAt)
      ? payload.completedAt
      : null,
    durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : null,
  };
  if (
    mode === "daily" &&
    session.status === "active" &&
    remainingBridgeSeconds(session, now) === 0
  ) {
    return expireBridgeSession(session, now);
  }
  return session;
}

export function serializeBridgeSession(session) {
  return {
    version: 1,
    puzzleId: session.puzzle.id,
    mode: session.mode,
    answerText: session.answerText,
    attempts: session.attempts,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    durationMs: session.durationMs,
  };
}
