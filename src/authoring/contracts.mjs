export const PUZZLE_STUDIO_SCHEMA_VERSION = 1;
export const PUZZLE_STUDIO_TIME_ZONE = "America/New_York";
export const AUTHORABLE_GAME_IDS = Object.freeze([
  "syllabl",
  "rarity",
  "before-after",
  "decode",
  "token",
  "dual",
]);
export const PUZZLE_DRAFT_STATUSES = Object.freeze([
  "draft",
  "validated",
  "playtested",
  "approved",
]);

const GAME_IDS = new Set(AUTHORABLE_GAME_IDS);
const DRAFT_STATUSES = new Set(PUZZLE_DRAFT_STATUSES);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isInteger(value, min, max = Number.POSITIVE_INFINITY) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteNumber(value, min = Number.NEGATIVE_INFINITY) {
  return Number.isFinite(value) && value >= min;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isDateKey(value) {
  if (!DATE_PATTERN.test(String(value))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateString(errors, value, path, options) {
  if (!isString(value, options)) addError(errors, path, "must be a string of the expected length");
}

function validateStringArray(errors, value, path, { maxItems = 20, itemMax = 80 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    addError(errors, path, `must be an array with at most ${maxItems} items`);
    return;
  }
  value.forEach((item, index) => validateString(errors, item, `${path}[${index}]`, { min: 1, max: itemMax }));
}

function validateCommonDocument(document, kind, errors) {
  if (!isObject(document)) {
    addError(errors, "$", "must be an object");
    return false;
  }
  if (document.kind !== kind) addError(errors, "kind", `must equal ${kind}`);
  if (document.schemaVersion !== PUZZLE_STUDIO_SCHEMA_VERSION) {
    addError(errors, "schemaVersion", `must equal ${PUZZLE_STUDIO_SCHEMA_VERSION}`);
  }
  if (!GAME_IDS.has(document.gameId)) addError(errors, "gameId", "must be an authorable game");
  if (!isString(document.id, { min: 3, max: 80 }) || !ID_PATTERN.test(document.id)) {
    addError(errors, "id", "must be a lowercase kebab-case identifier");
  }
  validateString(errors, document.title, "title", { min: kind === "published-puzzle" ? 1 : 0, max: 100 });
  validateStringArray(errors, document.tags, "tags", { maxItems: 20, itemMax: 32 });
  if (Array.isArray(document.tags) && new Set(document.tags.map((tag) => tag.toLocaleLowerCase())).size !== document.tags.length) {
    addError(errors, "tags", "must not contain duplicates");
  }
  return true;
}

function validateSyllablDraft(payload, errors) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  validateString(errors, payload.puzzleLetters, "payload.puzzleLetters", { max: 3 });
  if (payload.difficulty !== null && !isInteger(payload.difficulty, 1, 5)) {
    addError(errors, "payload.difficulty", "must be null or an integer from 1 through 5");
  }
  if (!Array.isArray(payload.stages) || payload.stages.length !== 6) {
    addError(errors, "payload.stages", "must contain exactly six stages");
    return;
  }
  payload.stages.forEach((stage, index) => {
    const path = `payload.stages[${index}]`;
    if (!isObject(stage)) return addError(errors, path, "must be an object");
    if (!isInteger(stage.placementCode, 1, 4)) addError(errors, `${path}.placementCode`, "must be 1, 2, 3, or 4");
    if (!isInteger(stage.syllablesRequired, 1, 6)) addError(errors, `${path}.syllablesRequired`, "must be from 1 through 6");
    validateString(errors, stage.proofWord, `${path}.proofWord`, { max: 80 });
  });
}

function validateSyllablPublished(payload, errors) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  if (!/^[a-z]{3}$/.test(payload.puzzleLetters ?? "")) addError(errors, "payload.puzzleLetters", "must be exactly three lowercase letters");
  if (payload.difficulty !== null && !isInteger(payload.difficulty, 1, 5)) addError(errors, "payload.difficulty", "must be null or an integer from 1 through 5");
  if (!Array.isArray(payload.inputsEnabled) || payload.inputsEnabled.length !== 6 || payload.inputsEnabled.some((value) => !isInteger(value, 1, 4))) {
    addError(errors, "payload.inputsEnabled", "must contain six placement codes from 1 through 4");
  }
  if (!Array.isArray(payload.syllablesRequired) || payload.syllablesRequired.length !== 6 || payload.syllablesRequired.some((value) => !isInteger(value, 1, 6))) {
    addError(errors, "payload.syllablesRequired", "must contain six syllable counts from 1 through 6");
  }
  if (Array.isArray(payload.inputsEnabled) && Array.isArray(payload.syllablesRequired) && payload.inputsEnabled.length === 6 && payload.syllablesRequired.length === 6) {
    const combinations = payload.inputsEnabled.map((placement, index) => `${placement}:${payload.syllablesRequired[index]}`);
    if (new Set(combinations).size !== 6) addError(errors, "payload", "must use six unique placement and syllable combinations");
  }
}

function validateRarity(payload, errors, published) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  const pattern = published ? /^[a-z]{2,10}$/ : /^[a-z]{0,10}$/;
  if (!pattern.test(payload.puzzleString ?? "")) addError(errors, "payload.puzzleString", "must be a lowercase string from 2 through 10 letters when published");
  if (payload.difficulty !== null && !isInteger(payload.difficulty, 0, 5)) addError(errors, "payload.difficulty", "must be null or an integer from 0 through 5");
  validateString(errors, payload.curatorName, "payload.curatorName", { max: 100 });
  if (!published) validateStringArray(errors, payload.referenceWords, "payload.referenceWords", { maxItems: 30, itemMax: 80 });
}

function validateBeforeAfter(payload, errors, published) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  validateString(errors, payload.answer, "payload.answer", { min: published ? 1 : 0, max: 15 });
  if (!Array.isArray(payload.clueWords) || payload.clueWords.length !== 2) {
    addError(errors, "payload.clueWords", "must contain exactly two clues");
  } else {
    payload.clueWords.forEach((clue, index) => validateString(errors, clue, `payload.clueWords[${index}]`, { min: published ? 1 : 0, max: 100 }));
    if (published && payload.clueWords[0].trim().toLocaleLowerCase() === payload.clueWords[1].trim().toLocaleLowerCase()) {
      addError(errors, "payload.clueWords", "must contain two different clues");
    }
  }
  if (!["before", "after", "both"].includes(payload.position)) addError(errors, "payload.position", "must be before, after, or both");
  if (!isInteger(payload.difficulty, 1, 5)) addError(errors, "payload.difficulty", "must be an integer from 1 through 5");
  validateString(errors, payload.packId, "payload.packId", { max: 80 });
}

function validateDecode(payload, errors, published) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  const authoringType = payload.authoringType ?? "bank";
  if (!["daily-5", "bank"].includes(authoringType)) addError(errors, "payload.authoringType", "must be daily-5 or bank");
  const entries = Array.isArray(payload.entries) ? payload.entries : [{ answer: payload.answer, clueWord: payload.clueWord, clue: payload.clue }];
  const expectedEntries = authoringType === "daily-5" ? 5 : 1;
  if (entries.length !== expectedEntries) addError(errors, "payload.entries", `must contain exactly ${expectedEntries} ${expectedEntries === 1 ? "entry" : "entries"}`);
  const wordPattern = published ? /^[A-Z]{4,7}$/ : /^[A-Za-z]{0,7}$/;
  entries.forEach((entry, index) => {
    const path = `payload.entries[${index}]`;
    if (!isObject(entry)) return addError(errors, path, "must be an object");
    if (!wordPattern.test(entry.answer ?? "")) addError(errors, `${path}.answer`, "must be a four- through seven-letter word when published");
    if (!wordPattern.test(entry.clueWord ?? "")) addError(errors, `${path}.clueWord`, "must be a four- through seven-letter word when published");
    if (published && entry.answer.length !== entry.clueWord.length) addError(errors, `${path}.clueWord`, "must have the same length as the answer");
    validateString(errors, entry.clue, `${path}.clue`, { min: published ? 1 : 0, max: 240 });
  });
  if (payload.theme !== null) validateString(errors, payload.theme, "payload.theme", { max: 80 });
  if (published && authoringType === "daily-5" && !String(payload.theme ?? "").trim()) addError(errors, "payload.theme", "must name the Daily 5 theme");
  const allowedModes = new Set(["timed", "daily-5", "zen"]);
  if (!Array.isArray(payload.modes) || (published && payload.modes.length === 0) || payload.modes.some((mode) => !allowedModes.has(mode))) {
    addError(errors, "payload.modes", "must contain supported DECODE modes");
  }
  if (published && authoringType === "daily-5" && !payload.modes?.includes("daily-5")) addError(errors, "payload.modes", "must include daily-5");
  if (published && authoringType === "bank" && (!payload.modes?.some((mode) => mode === "timed" || mode === "zen") || payload.modes.includes("daily-5"))) addError(errors, "payload.modes", "bank entries must use Timed, Zen, or both");
}

function validateTokenCandidate(candidate, errors, path) {
  if (!isObject(candidate)) return addError(errors, path, "must be an object");
  validateString(errors, candidate.token, `${path}.token`, { min: 1, max: 100 });
  if (!isFiniteNumber(candidate.score, 0)) addError(errors, `${path}.score`, "must be a non-negative number");
}

function validateTokenStop(stop, errors, path, responseLength) {
  if (!isObject(stop)) return addError(errors, path, "must be an object");
  if (!isInteger(stop.index, 0, Math.max(0, responseLength - 1))) addError(errors, `${path}.index`, "must point to a response token");
  validateString(errors, stop.token, `${path}.token`, { min: 1, max: 100 });
  if (!Array.isArray(stop.candidates) || stop.candidates.length === 0 || stop.candidates.length > 10) {
    addError(errors, `${path}.candidates`, "must contain from 1 through 10 candidates");
  } else {
    stop.candidates.forEach((candidate, index) => validateTokenCandidate(candidate, errors, `${path}.candidates[${index}]`));
  }
}

function validateTokenDraft(payload, errors) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  if (!["easy", "hard"].includes(payload.difficulty)) addError(errors, "payload.difficulty", "must be easy or hard");
  validateString(errors, payload.summary, "payload.summary", { max: 240 });
  validateStringArray(errors, payload.selectedStopIds, "payload.selectedStopIds", { maxItems: 100, itemMax: 80 });
  if (payload.generation !== null && !isObject(payload.generation)) addError(errors, "payload.generation", "must be null or a TOKEN generation draft");
  if (isObject(payload.generation)) {
    if (payload.generation.schemaVersion !== 1) addError(errors, "payload.generation.schemaVersion", "must equal 1");
    validateString(errors, payload.generation.prompt, "payload.generation.prompt", { max: 4000 });
    validateString(errors, payload.generation.responseText, "payload.generation.responseText", { max: 20000 });
    validateString(errors, payload.generation.model, "payload.generation.model", { max: 100 });
    validateString(errors, payload.generation.authoringNotes, "payload.generation.authoringNotes", { max: 4000 });
    if (!Array.isArray(payload.generation.rawTokens)) addError(errors, "payload.generation.rawTokens", "must be an array");
    if (!Array.isArray(payload.generation.words)) addError(errors, "payload.generation.words", "must be an array");
  }
}

function validateTokenPublished(payload, errors) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  if (!["easy", "hard"].includes(payload.difficulty)) addError(errors, "payload.difficulty", "must be easy or hard");
  validateString(errors, payload.summary, "payload.summary", { min: 1, max: 240 });
  validateString(errors, payload.prompt, "payload.prompt", { min: 1, max: 4000 });
  if (!Array.isArray(payload.responseTokens) || payload.responseTokens.length === 0) {
    addError(errors, "payload.responseTokens", "must contain the complete response token stream");
  } else {
    payload.responseTokens.forEach((token, index) => validateString(errors, token, `payload.responseTokens[${index}]`, { min: 1, max: 1000 }));
  }
  if (!Array.isArray(payload.stops) || payload.stops.length === 0) {
    addError(errors, "payload.stops", "must contain at least one prediction stop");
  } else {
    payload.stops.forEach((stop, index) => validateTokenStop(stop, errors, `payload.stops[${index}]`, payload.responseTokens?.length ?? 0));
    const indexes = payload.stops.map((stop) => stop?.index);
    if (new Set(indexes).size !== indexes.length) addError(errors, "payload.stops", "must not contain duplicate stop indexes");
  }
  if (!isObject(payload.tokenizer)) return addError(errors, "payload.tokenizer", "must be an object");
  validateString(errors, payload.tokenizer.id, "payload.tokenizer.id", { min: 1, max: 100 });
  validateString(errors, payload.tokenizer.note, "payload.tokenizer.note", { min: 1, max: 500 });
}

function validateDualDraft(payload, errors) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  if (!/^[A-Za-zÑñ]{0,3}$/u.test(payload.sequence ?? "")) addError(errors, "payload.sequence", "must contain at most three letters");
  validateString(errors, payload.corpusRevision, "payload.corpusRevision", { max: 160 });
  if (!isObject(payload.settings)) {
    addError(errors, "payload.settings", "must be an object");
  } else {
    for (const key of ["targetScore", "minimumEnglish", "minimumSpanish"]) {
      if (!isFiniteNumber(payload.settings[key], 0)) addError(errors, `payload.settings.${key}`, "must be a non-negative number");
    }
  }
  if (!isObject(payload.overrides)) addError(errors, "payload.overrides", "must be an object");
  if (!isObject(payload.familyOverrides)) addError(errors, "payload.familyOverrides", "must be an object");
  if (payload.lexicon !== undefined && !Array.isArray(payload.lexicon)) addError(errors, "payload.lexicon", "must be an array when retained by the Studio builder");
}

function validateDualLexiconEntry(entry, errors, path) {
  if (!isObject(entry)) return addError(errors, path, "must be an object");
  validateString(errors, entry.surface, `${path}.surface`, { min: 1, max: 120 });
  if (!Array.isArray(entry.senses) || entry.senses.length === 0) addError(errors, `${path}.senses`, "must contain at least one lexical sense");
  if (!isObject(entry.policy) || entry.policy.accepted !== true) addError(errors, `${path}.policy`, "must mark the entry accepted");
  if (!isObject(entry.source) || !["curated-fixture", "wiktionary", "kaikki-builder"].includes(entry.source.kind)) {
    addError(errors, `${path}.source`, "must identify a supported lexical source");
  }
}

function validateDualPublished(payload, errors) {
  if (!isObject(payload)) return addError(errors, "payload", "must be an object");
  if (!/^[A-ZÑ]{3}$/u.test(payload.sequence ?? "")) addError(errors, "payload.sequence", "must be exactly three uppercase letters");
  for (const key of ["targetScore", "minimumEnglish", "minimumSpanish", "dualCount"]) {
    if (!isFiniteNumber(payload[key], 0)) addError(errors, `payload.${key}`, "must be a non-negative number");
  }
  if (!Array.isArray(payload.lexicon) || payload.lexicon.length === 0) {
    addError(errors, "payload.lexicon", "must contain the accepted authored lexicon");
  } else {
    payload.lexicon.forEach((entry, index) => validateDualLexiconEntry(entry, errors, `payload.lexicon[${index}]`));
  }
}

const draftValidators = {
  syllabl: validateSyllablDraft,
  rarity: (payload, errors) => validateRarity(payload, errors, false),
  "before-after": (payload, errors) => validateBeforeAfter(payload, errors, false),
  decode: (payload, errors) => validateDecode(payload, errors, false),
  token: validateTokenDraft,
  dual: validateDualDraft,
};

const publishedValidators = {
  syllabl: validateSyllablPublished,
  rarity: (payload, errors) => validateRarity(payload, errors, true),
  "before-after": (payload, errors) => validateBeforeAfter(payload, errors, true),
  decode: (payload, errors) => validateDecode(payload, errors, true),
  token: validateTokenPublished,
  dual: validateDualPublished,
};

export function createEmptyPuzzlePayload(gameId) {
  switch (gameId) {
    case "syllabl":
      return { puzzleLetters: "", difficulty: null, stages: Array.from({ length: 6 }, () => ({ placementCode: 1, syllablesRequired: 1, proofWord: "" })) };
    case "rarity":
      return { puzzleString: "", difficulty: null, curatorName: "", referenceWords: [] };
    case "before-after":
      return { answer: "", clueWords: ["", ""], position: "before", difficulty: 1, packId: "" };
    case "decode":
      return { authoringType: "daily-5", entries: Array.from({ length: 5 }, () => ({ answer: "", clueWord: "", clue: "" })), theme: "", modes: ["daily-5", "timed", "zen"] };
    case "token":
      return { difficulty: "easy", summary: "", generation: null, selectedStopIds: [] };
    case "dual":
      return { sequence: "", corpusRevision: "", settings: { targetScore: 0, minimumEnglish: 0, minimumSpanish: 0 }, overrides: {}, familyOverrides: {} };
    default:
      throw new RangeError(`Unsupported Puzzle Studio game: ${gameId}`);
  }
}

export function validatePuzzleDraft(document) {
  const errors = [];
  if (!validateCommonDocument(document, "puzzle-draft", errors)) return { valid: false, errors };
  if (!DRAFT_STATUSES.has(document.status)) addError(errors, "status", "must be a supported draft status");
  validateString(errors, document.notes, "notes", { max: 10000 });
  if (!isIsoTimestamp(document.createdAt)) addError(errors, "createdAt", "must be a valid timestamp");
  if (!isIsoTimestamp(document.updatedAt)) addError(errors, "updatedAt", "must be a valid timestamp");
  if (document.baseRevision !== null && !isInteger(document.baseRevision, 1)) addError(errors, "baseRevision", "must be null or a positive integer");
  draftValidators[document.gameId]?.(document.payload, errors);
  return { valid: errors.length === 0, errors };
}

export function validatePublishedPuzzle(document) {
  const errors = [];
  if (!validateCommonDocument(document, "published-puzzle", errors)) return { valid: false, errors };
  validateString(errors, document.summary, "summary", { min: 1, max: 240 });
  if (!isInteger(document.revision, 1)) addError(errors, "revision", "must be a positive integer");
  if (!isIsoTimestamp(document.publishedAt)) addError(errors, "publishedAt", "must be a valid timestamp");
  publishedValidators[document.gameId]?.(document.payload, errors);
  return { valid: errors.length === 0, errors };
}

export function validatePuzzleSchedule(document) {
  const errors = [];
  if (!isObject(document)) return { valid: false, errors: [{ path: "$", message: "must be an object" }] };
  if (document.kind !== "puzzle-schedule") addError(errors, "kind", "must equal puzzle-schedule");
  if (document.schemaVersion !== PUZZLE_STUDIO_SCHEMA_VERSION) addError(errors, "schemaVersion", `must equal ${PUZZLE_STUDIO_SCHEMA_VERSION}`);
  validateString(errors, document.timeZone, "timeZone", { min: 1, max: 100 });
  if (!Array.isArray(document.entries)) {
    addError(errors, "entries", "must be an array");
  } else {
    const slots = new Set();
    document.entries.forEach((entry, index) => {
      const path = `entries[${index}]`;
      if (!isObject(entry)) return addError(errors, path, "must be an object");
      if (!GAME_IDS.has(entry.gameId)) addError(errors, `${path}.gameId`, "must be an authorable game");
      validateString(errors, entry.mode, `${path}.mode`, { min: 1, max: 80 });
      if (!isDateKey(entry.date)) addError(errors, `${path}.date`, "must be a real YYYY-MM-DD date");
      if (!Array.isArray(entry.puzzles) || entry.puzzles.length === 0) {
        addError(errors, `${path}.puzzles`, "must contain at least one puzzle revision");
      } else {
        entry.puzzles.forEach((reference, referenceIndex) => {
          const referencePath = `${path}.puzzles[${referenceIndex}]`;
          if (!isObject(reference)) return addError(errors, referencePath, "must be an object");
          if (!isString(reference.puzzleId, { min: 3, max: 80 }) || !ID_PATTERN.test(reference.puzzleId)) addError(errors, `${referencePath}.puzzleId`, "must be a lowercase kebab-case identifier");
          if (!isInteger(reference.revision, 1)) addError(errors, `${referencePath}.revision`, "must be a positive integer");
        });
      }
      const slot = `${entry.gameId}:${entry.mode}:${entry.date}`;
      if (slots.has(slot)) addError(errors, path, "duplicates an existing game, mode, and date slot");
      slots.add(slot);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function assertPuzzleDraft(document) {
  const result = validatePuzzleDraft(document);
  if (!result.valid) throw new TypeError(result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  return document;
}

export function assertPublishedPuzzle(document) {
  const result = validatePublishedPuzzle(document);
  if (!result.valid) throw new TypeError(result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  return document;
}
