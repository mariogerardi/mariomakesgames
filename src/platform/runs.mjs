export const GAME_RUN_SCHEMA_VERSION = 1;
export const CLOUD_GAME_IDS = Object.freeze([
  "syllabl",
  "rarity",
  "before-after",
  "decode",
  "token",
  "dual",
]);

const OUTCOMES = new Set(["in-progress", "completed", "abandoned"]);
const MODES_BY_GAME = Object.freeze({
  syllabl: new Set(["daily"]),
  rarity: new Set(["daily"]),
  "before-after": new Set(["packs", "daily", "archive"]),
  decode: new Set(["timed", "daily-5", "zen"]),
  token: new Set(["daily-easy", "daily-hard", "archive"]),
  dual: new Set(["daily", "archive"]),
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resultIsPlausible(gameId, result) {
  if (!isObject(result)) return false;
  switch (gameId) {
    case "syllabl":
      return Array.isArray(result.guesses) && Number.isInteger(result.stagesCompleted);
    case "rarity":
      return result.submission === null || isObject(result.submission);
    case "before-after":
      return Number.isInteger(result.attempts) && Number.isFinite(result.durationMs);
    case "decode":
      return Number.isFinite(result.score) && Number.isInteger(result.signalsCompleted);
    case "token":
      return Number.isFinite(result.averageScore) && Array.isArray(result.predictions);
    case "dual":
      return Number.isFinite(result.score) && Array.isArray(result.submissions);
    default:
      return false;
  }
}

export function validateGameRun(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["run must be an object"] };
  if (value.schemaVersion !== GAME_RUN_SCHEMA_VERSION) errors.push(`schemaVersion must equal ${GAME_RUN_SCHEMA_VERSION}`);
  if (!isNonEmptyString(value.runId)) errors.push("runId must be a non-empty string");
  if (value.playerId !== null && !isNonEmptyString(value.playerId)) errors.push("playerId must be null or a non-empty string");
  if (!CLOUD_GAME_IDS.includes(value.gameId)) errors.push("gameId must identify a cloud-ready game");
  if (!isNonEmptyString(value.mode)) errors.push("mode must be a non-empty string");
  else if (CLOUD_GAME_IDS.includes(value.gameId) && !MODES_BY_GAME[value.gameId].has(value.mode)) errors.push(`mode is not supported by ${value.gameId}`);
  if (!isObject(value.puzzle)) {
    errors.push("puzzle must be an object");
  } else {
    if (!isNonEmptyString(value.puzzle.id)) errors.push("puzzle.id must be a non-empty string");
    if (!Number.isInteger(value.puzzle.revision) || value.puzzle.revision < 1) errors.push("puzzle.revision must be a positive integer");
    if (value.puzzle.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value.puzzle.date)) errors.push("puzzle.date must be YYYY-MM-DD when present");
  }
  if (!isTimestamp(value.startedAt)) errors.push("startedAt must be an ISO timestamp");
  if (value.syncRevision !== undefined && (!Number.isInteger(value.syncRevision) || value.syncRevision < 0)) errors.push("syncRevision must be nonnegative");
  if (value.updatedAt !== undefined && !isTimestamp(value.updatedAt)) errors.push("updatedAt must be an ISO timestamp");
  if (value.checkpoint !== undefined && (!isObject(value.checkpoint) || value.checkpoint.version !== 1 || !isObject(value.checkpoint.state))) errors.push("checkpoint must contain version 1 state");
  if (value.completedAt !== null && !isTimestamp(value.completedAt)) errors.push("completedAt must be null or an ISO timestamp");
  if (!OUTCOMES.has(value.outcome)) errors.push("outcome must be in-progress, completed, or abandoned");
  if (value.outcome === "completed" && value.completedAt === null) errors.push("completed runs must include completedAt");
  if (value.score !== undefined && !Number.isFinite(value.score)) errors.push("score must be finite when present");
  if (CLOUD_GAME_IDS.includes(value.gameId) && !resultIsPlausible(value.gameId, value.result)) errors.push(`result does not match ${value.gameId}`);
  return { valid: errors.length === 0, errors };
}

export function assertGameRun(value) {
  const validation = validateGameRun(value);
  if (!validation.valid) throw new TypeError(validation.errors.join("\n"));
  return value;
}
