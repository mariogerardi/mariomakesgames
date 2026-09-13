export const BEFORE_AFTER_ANSWER_LIMIT = 15;

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
    activeElapsedMs: 0,
    resumedAt: startedAt,
    completedAt: null,
    durationMs: null,
  };
}

function activeBridgeDurationMs(session, now = Date.now()) {
  const accumulated = Math.max(0, Number(session.activeElapsedMs) || 0);
  if (session.status !== "active" || !Number.isFinite(session.resumedAt)) return accumulated;
  return accumulated + Math.max(0, now - session.resumedAt);
}

export function pauseBridgeSession(session, now = Date.now()) {
  if (session.status !== "active" || !Number.isFinite(session.resumedAt)) return session;
  return { ...session, activeElapsedMs: activeBridgeDurationMs(session, now), resumedAt: null };
}

export function resumeBridgeSession(session, now = Date.now()) {
  if (session.status !== "active" || Number.isFinite(session.resumedAt)) return session;
  return { ...session, resumedAt: now };
}

export function submitBridgeAnswer(session, answer, now = Date.now()) {
  if (session.status !== "active") {
    return { accepted: false, correct: session.status === "solved", state: session };
  }
  const normalized = normalizeBridgeAnswer(answer);
  if (!normalized) {
    return { accepted: false, correct: false, state: session };
  }
  const correct =
    normalized === normalizeBridgeAnswer(session.puzzle.answer);
  const attempts = session.attempts + 1;
  const durationMs = activeBridgeDurationMs(session, now);
  const state = {
    ...session,
    answerText: correct ? session.puzzle.answer.toLowerCase() : normalized,
    attempts,
    status: correct ? "solved" : "active",
    activeElapsedMs: durationMs,
    resumedAt: correct ? null : now,
    completedAt: correct ? now : null,
    durationMs: correct ? durationMs : null,
  };
  return { accepted: true, correct, state };
}

export function revealBridgeAnswer(session, now = Date.now()) {
  if (session.status !== "active") return session;
  return {
    ...session,
    answerText: session.puzzle.answer.toLowerCase(),
    status: "revealed",
    activeElapsedMs: activeBridgeDurationMs(session, now),
    resumedAt: null,
    completedAt: now,
    durationMs: activeBridgeDurationMs(session, now),
  };
}

export function elapsedBridgeSeconds(session, now = Date.now()) {
  const duration = session.status === "active"
    ? activeBridgeDurationMs(session, now)
    : Number.isFinite(session.durationMs) ? session.durationMs : activeBridgeDurationMs(session, now);
  return Math.floor(Math.max(0, duration) / 1000);
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
  const wasExpired = payload.status === "expired";
  const status = payload.status === "solved"
    ? "solved"
    : payload.status === "revealed" || payload.status === "abandoned"
      ? "revealed"
      : "active";
  const completedDuration = Number.isFinite(payload.durationMs) ? Math.max(0, payload.durationMs) : null;
  const storedElapsed = Number.isFinite(payload.activeElapsedMs)
    ? Math.max(0, payload.activeElapsedMs)
    : status === "active"
      ? Math.max(0, now - payload.startedAt)
      : completedDuration ?? 0;
  const session = {
    ...fresh,
    answerText: typeof payload.answerText === "string" ? payload.answerText : "",
    attempts: Math.max(0, Number(payload.attempts) || 0),
    status,
    startedAt: wasExpired ? now : payload.startedAt,
    activeElapsedMs: wasExpired ? 0 : storedElapsed,
    resumedAt: status === "active" && !wasExpired && Number.isFinite(payload.resumedAt) ? payload.resumedAt : null,
    completedAt: status !== "active" && Number.isFinite(payload.completedAt)
      ? payload.completedAt
      : null,
    durationMs: status !== "active" ? completedDuration : null,
  };
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
    activeElapsedMs: session.activeElapsedMs,
    resumedAt: session.resumedAt,
    completedAt: session.completedAt,
    durationMs: session.durationMs,
  };
}
