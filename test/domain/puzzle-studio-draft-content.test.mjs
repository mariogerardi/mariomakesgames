import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORABLE_GAME_IDS,
  PUZZLE_STUDIO_SCHEMA_VERSION,
  createEmptyPuzzlePayload,
} from "../../src/authoring/contracts.mjs";
import { isMeaningfulPuzzleDraft } from "../../src/authoring/draft-content.mjs";

function emptyDraft(gameId) {
  return {
    kind: "puzzle-draft",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    gameId,
    id: `${gameId}-empty`,
    title: "",
    tags: [],
    status: "draft",
    notes: "",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    baseRevision: null,
    payload: createEmptyPuzzlePayload(gameId),
  };
}

test("blank canvases are not meaningful drafts for any Studio game", () => {
  for (const gameId of AUTHORABLE_GAME_IDS) {
    assert.equal(isMeaningfulPuzzleDraft(emptyDraft(gameId)), false, gameId);
  }
});

test("game content and private author notes both start the draft lifecycle", () => {
  const rarity = emptyDraft("rarity");
  rarity.payload.puzzleString = "wel";
  assert.equal(isMeaningfulPuzzleDraft(rarity), true);

  const token = emptyDraft("token");
  token.notes = "Try a more surprising response.";
  assert.equal(isMeaningfulPuzzleDraft(token), true);
});
