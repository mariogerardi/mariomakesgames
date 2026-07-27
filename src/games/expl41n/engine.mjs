export const EXPL41N_CLUE_LIMIT = 25;
export const EXPL41N_DAILY_ATTEMPTS = 5;

export function validateExpl41nClue(value) {
  const clue = String(value ?? "").trim();
  if (!clue) return { valid: false, reason: "empty", clue };
  if (clue.length > EXPL41N_CLUE_LIMIT) {
    return { valid: false, reason: "too-long", clue };
  }
  return { valid: true, reason: null, clue };
}

export function validateExpl41nCustomWord(value) {
  const word = String(value ?? "").trim();
  if (!word) return { valid: false, reason: "empty", word };
  if (word.includes(" ")) return { valid: false, reason: "spaces", word };
  return {
    valid: true,
    reason: null,
    word: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  };
}

export function createExpl41nSession({ puzzle, mode, sessionDate }) {
  return {
    version: 1,
    puzzle,
    mode,
    sessionDate,
    attempts: [],
    status: "active",
    winningAttempt: null,
  };
}

export function applyExpl41nGuess(session, { clue, response, timestamp }) {
  if (session.status !== "active") {
    return { accepted: false, reason: "session-complete", state: session };
  }
  const validation = validateExpl41nClue(clue);
  if (!validation.valid) {
    return { accepted: false, reason: validation.reason, state: session };
  }

  const guess = String(response?.guess || "Huh").trim() || "Huh";
  const confidence = clampMetric(response?.confidence, 25);
  const searchSpace = clampMetric(response?.searchSpace, 100);
  const reasoning =
    String(response?.reasoning || "").trim() ||
    "I am having trouble making the connection.";
  const won = guess.toLowerCase() === session.puzzle.word.toLowerCase();
  const attempt = {
    clue: validation.clue,
    characters: validation.clue.length,
    guess,
    confidence,
    searchSpace,
    reasoning,
    won,
    timestamp,
  };
  const attempts = [...session.attempts, attempt];
  const lost =
    !won &&
    session.mode === "daily" &&
    attempts.length >= EXPL41N_DAILY_ATTEMPTS;
  const state = {
    ...session,
    attempts,
    status: won ? "won" : lost ? "lost" : "active",
    winningAttempt: won ? attempt : null,
  };
  return { accepted: true, reason: null, won, lost, attempt, state };
}

export function serializeExpl41nSession(session) {
  return {
    version: 1,
    puzzleDate: session.puzzle.date,
    puzzleWord: session.puzzle.word,
    mode: session.mode,
    sessionDate: session.sessionDate,
    attempts: session.attempts,
    status: session.status,
    winningAttempt: session.winningAttempt,
  };
}

export function hydrateExpl41nSession({ payload, puzzle, mode, sessionDate }) {
  const fresh = createExpl41nSession({ puzzle, mode, sessionDate });
  if (!payload || typeof payload !== "object") return fresh;
  if (payload.puzzleDate !== puzzle.date || payload.puzzleWord !== puzzle.word) {
    return fresh;
  }
  if (payload.mode !== mode || payload.sessionDate !== sessionDate) return fresh;
  const attempts = Array.isArray(payload.attempts)
    ? payload.attempts.filter(isStoredAttempt).slice(0, mode === "daily" ? 5 : 100)
    : [];
  const winningAttempt =
    attempts.find((attempt) => attempt.won === true) ?? null;
  const status = winningAttempt
    ? "won"
    : mode === "daily" && attempts.length >= EXPL41N_DAILY_ATTEMPTS
      ? "lost"
      : "active";
  return { ...fresh, attempts, winningAttempt, status };
}

export function attemptsRemaining(session) {
  if (session.mode !== "daily") return Number.POSITIVE_INFINITY;
  return Math.max(0, EXPL41N_DAILY_ATTEMPTS - session.attempts.length);
}

export function expl41nAvatarMood(confidence, status = "active") {
  if (status === "won") return "victory";
  if (status === "lost") return "sad";
  if (confidence <= 10) return "angry";
  if (confidence <= 30) return "confused";
  if (confidence <= 50) return "suspicious";
  if (confidence <= 60) return "side-eye";
  if (confidence <= 80) return "happy";
  return "surprised";
}

function clampMetric(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function isStoredAttempt(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.clue === "string" &&
    value.clue.length > 0 &&
    value.clue.length <= EXPL41N_CLUE_LIMIT &&
    typeof value.guess === "string" &&
    Number.isFinite(value.confidence) &&
    Number.isFinite(value.searchSpace) &&
    typeof value.reasoning === "string" &&
    typeof value.won === "boolean"
  );
}
