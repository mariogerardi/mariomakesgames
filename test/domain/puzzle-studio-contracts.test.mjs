import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORABLE_GAME_IDS,
  PUZZLE_STUDIO_SCHEMA_VERSION,
  createEmptyPuzzlePayload,
  validatePublishedPuzzle,
  validatePuzzleDraft,
  validatePuzzleSchedule,
} from "../../src/authoring/contracts.mjs";

const timestamp = "2026-09-02T12:00:00.000Z";

function draftFor(gameId) {
  return {
    kind: "puzzle-draft",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    gameId,
    id: `${gameId}-draft`,
    title: "",
    tags: [],
    status: "draft",
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    baseRevision: null,
    payload: createEmptyPuzzlePayload(gameId),
  };
}

function publishedFor(gameId, payload) {
  return {
    kind: "published-puzzle",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    gameId,
    id: `${gameId}-fixture`,
    title: `${gameId} fixture`,
    summary: "A contract fixture.",
    tags: ["fixture"],
    revision: 1,
    publishedAt: timestamp,
    payload,
  };
}

test("all six in-scope games have structurally saveable empty drafts", () => {
  assert.deepEqual(AUTHORABLE_GAME_IDS, ["syllabl", "rarity", "before-after", "decode", "token", "dual"]);
  for (const gameId of AUTHORABLE_GAME_IDS) {
    assert.deepEqual(validatePuzzleDraft(draftFor(gameId)), { valid: true, errors: [] }, gameId);
  }
});

test("all six games have strict valid published payloads", () => {
  const fixtures = {
    syllabl: {
      puzzleLetters: "pro",
      difficulty: 3,
      inputsEnabled: [2, 1, 3, 4, 2, 3],
      syllablesRequired: [5, 2, 3, 2, 4, 5],
    },
    rarity: { puzzleString: "wel", difficulty: 2, curatorName: "Mario" },
    "before-after": { answer: "body", clueWords: ["double", "heavenly"], position: "both", difficulty: 2, packId: "daily" },
    decode: { answer: "BARE", clueWord: "BAKE", clue: "stripped; unadorned", theme: null, modes: ["timed", "zen"] },
    token: {
      difficulty: "easy",
      summary: "A short generated response.",
      prompt: "Describe a camera to a dog.",
      responseTokens: ["A", "camera", "blinks."],
      stops: [{ index: 1, token: "camera", candidates: [{ token: "machine", score: 12 }] }],
      tokenizer: { id: "word-v1", note: "Written words." },
    },
    dual: {
      sequence: "CTU",
      targetScore: 22,
      minimumEnglish: 8,
      minimumSpanish: 8,
      dualCount: 5,
      lexicon: [{
        surface: "actual",
        senses: [{ language: "en", lemma: "actual", formKind: "lemma", partOfSpeech: "adjective" }],
        policy: { accepted: true, loanwordStatus: "historical" },
        source: { kind: "kaikki-builder" },
      }],
    },
  };

  for (const gameId of AUTHORABLE_GAME_IDS) {
    const result = validatePublishedPuzzle(publishedFor(gameId, fixtures[gameId]));
    assert.equal(result.valid, true, `${gameId}: ${JSON.stringify(result.errors)}`);
  }
});

test("publication validation catches game-specific runtime hazards", () => {
  const syllabl = publishedFor("syllabl", {
    puzzleLetters: "PRO",
    difficulty: 3,
    inputsEnabled: [1, 1, 1, 1, 1, 1],
    syllablesRequired: [1, 1, 1, 1, 1, 1],
  });
  assert.equal(validatePublishedPuzzle(syllabl).valid, false);

  const decode = publishedFor("decode", {
    answer: "BARE",
    clueWord: "CLAMP",
    clue: "stripped",
    theme: null,
    modes: ["timed"],
  });
  assert.equal(validatePublishedPuzzle(decode).valid, false);

  const token = publishedFor("token", {
    difficulty: "easy",
    summary: "Broken stop.",
    prompt: "Describe something.",
    responseTokens: ["Only"],
    stops: [{ index: 4, token: "missing", candidates: [] }],
    tokenizer: { id: "word-v1", note: "Written words." },
  });
  assert.equal(validatePublishedPuzzle(token).valid, false);
});

test("DECODE publishes a complete themed Daily 5 as one document", () => {
  const daily = publishedFor("decode", {
    authoringType: "daily-5",
    theme: "Night Sky",
    modes: ["daily-5", "timed", "zen"],
    entries: [
      ["STAR", "STIR", "a bright point in the night sky"],
      ["COMET", "COVET", "an icy visitor with a tail"],
      ["PLANET", "PLANER", "a world orbiting a star"],
      ["METEOR", "METEER", "a streak of light in the atmosphere"],
      ["GALAXY", "GALLEY", "a vast system of stars"],
    ].map(([answer, clueWord, clue]) => ({ answer, clueWord, clue })),
  });
  assert.equal(validatePublishedPuzzle(daily).valid, true);
  daily.payload.entries.pop();
  assert.equal(validatePublishedPuzzle(daily).valid, false);
});

test("the shared schedule supports single puzzles and ordered multi-puzzle modes", () => {
  const schedule = {
    kind: "puzzle-schedule",
    schemaVersion: 1,
    timeZone: "America/New_York",
    entries: [
      { gameId: "syllabl", mode: "daily", date: "2026-09-03", puzzles: [{ puzzleId: "syllabl-pro", revision: 1 }] },
      {
        gameId: "decode",
        mode: "daily-5",
        date: "2026-09-03",
        puzzles: Array.from({ length: 5 }, (_, index) => ({ puzzleId: `decode-${index + 1}`, revision: 1 })),
      },
    ],
  };
  assert.deepEqual(validatePuzzleSchedule(schedule), { valid: true, errors: [] });

  schedule.entries.push({ ...schedule.entries[0] });
  assert.equal(validatePuzzleSchedule(schedule).valid, false);
});
