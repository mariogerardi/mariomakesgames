import assert from "node:assert/strict";
import test from "node:test";
import { findDuplicateIssues } from "../../src/authoring/duplicate-index.ts";

const base = { kind: "puzzle-draft", schemaVersion: 1, title: "", tags: [], status: "draft", notes: "", createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z", baseRevision: null };

test("string games reject duplicate content across differently named drafts", () => {
  const draft = { ...base, gameId: "syllabl", id: "new-syllabl", payload: { puzzleLetters: "pro", difficulty: null, stages: [] } };
  const existing = { ...draft, id: "existing-syllabl" };
  const issues = findDuplicateIssues({ draft, drafts: [existing], catalog: [], published: [], schedule: null });
  assert.equal(issues[0]?.severity, "block");
});

test("DECODE rejects repeated signals inside one Daily 5", () => {
  const signal = { answer: "BARE", clueWord: "BAKE", clue: "uncovered" };
  const draft = { ...base, gameId: "decode", id: "decode-daily", payload: { authoringType: "daily-5", entries: [signal, signal, signal, signal, signal], theme: "Test", modes: ["daily-5"] } };
  const issues = findDuplicateIssues({ draft, drafts: [], catalog: [], published: [], schedule: null });
  assert.equal(issues[0]?.severity, "block");
});
