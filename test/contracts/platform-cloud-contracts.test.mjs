import assert from "node:assert/strict";
import test from "node:test";

import {
  createGuestAuthSession,
  hasPlayerRole,
  isAuthenticatedSession,
} from "../../src/platform/identity.mjs";
import {
  createGuestPlayerRepository,
  createLocalRunRepository,
} from "../../src/platform/local-repositories.mjs";
import { validateGameRun } from "../../src/platform/runs.mjs";

function memoryStore() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function syllablRun(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: "run-syllabl-001",
    playerId: null,
    gameId: "syllabl",
    mode: "daily",
    puzzle: { id: "syllabl-001", revision: 1, date: "2026-09-03" },
    startedAt: "2026-09-03T12:00:00.000Z",
    completedAt: null,
    outcome: "in-progress",
    result: { stagesCompleted: 0, totalStages: 6, guesses: [] },
    ...overrides,
  };
}

test("guest and authenticated sessions remain explicit", () => {
  assert.deepEqual(createGuestAuthSession(), { kind: "guest" });
  const session = {
    kind: "authenticated",
    playerId: "player-1",
    accessToken: "token",
    expiresAt: Date.now() + 60_000,
    roles: ["player", "admin"],
  };
  assert.equal(isAuthenticatedSession(session), true);
  assert.equal(hasPlayerRole(session, "admin"), true);
  assert.equal(hasPlayerRole(createGuestAuthSession(), "admin"), false);
});

test("the guest player repository cannot manufacture an account", async () => {
  const repository = createGuestPlayerRepository();
  assert.equal(await repository.getCurrent(), null);
  await assert.rejects(() => repository.saveCurrent({}), /guest session/i);
});

test("game-run validation rejects mismatched result payloads", () => {
  assert.equal(validateGameRun(syllablRun()).valid, true);
  const invalid = validateGameRun(syllablRun({ result: { submission: null } }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /syllabl/);
});

test("all six game result envelopes have a valid minimal shape", () => {
  const shared = {
    schemaVersion: 1,
    runId: "run-001",
    playerId: null,
    puzzle: { id: "puzzle-001", revision: 1 },
    startedAt: "2026-09-03T12:00:00.000Z",
    completedAt: null,
    outcome: "in-progress",
  };
  const cases = [
    { ...shared, gameId: "syllabl", mode: "daily", result: { stagesCompleted: 0, totalStages: 6, guesses: [] } },
    { ...shared, gameId: "rarity", mode: "daily", result: { submission: null } },
    { ...shared, gameId: "before-after", mode: "archive", result: { attempts: 0, durationMs: 0, status: "abandoned" } },
    { ...shared, gameId: "decode", mode: "zen", result: { score: 0, signalsCompleted: 0 } },
    { ...shared, gameId: "token", mode: "daily-easy", result: { averageScore: 0, exactMatches: 0, predictions: [] } },
    { ...shared, gameId: "dual", mode: "daily", result: { score: 0, enScore: 0, esScore: 0, enFamilies: 0, esFamilies: 0, foundDuals: 0, totalDuals: 0, submissions: [] } },
  ];
  for (const run of cases) assert.deepEqual(validateGameRun(run), { valid: true, errors: [] });
  assert.match(validateGameRun({ ...cases[0], mode: "zen" }).errors.join(" "), /mode/);
});

test("local runs can be resumed and filtered without creating a player", async () => {
  const repository = createLocalRunRepository(memoryStore());
  const run = syllablRun();
  await repository.save(run);
  assert.deepEqual(await repository.get(run.runId), run);
  assert.equal((await repository.list({ gameId: "syllabl" })).length, 1);
  assert.equal((await repository.list({ gameId: "rarity" })).length, 0);

  const completed = syllablRun({
    completedAt: "2026-09-03T12:02:00.000Z",
    outcome: "completed",
    score: 6,
    result: { stagesCompleted: 6, totalStages: 6, guesses: [] },
  });
  await repository.save(completed);
  await assert.rejects(
    () => repository.save({ ...completed, score: 5 }),
    /immutable/i,
  );
});
