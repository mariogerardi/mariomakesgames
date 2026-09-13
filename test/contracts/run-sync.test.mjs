import assert from "node:assert/strict";
import test from "node:test";
import { createRunSync, runContent, runSyncResetKey, scopedProgressStorage } from "../../src/platform/run-sync.mjs";
import { prepareRunWrite } from "../../src/platform/run-write.mjs";
import { restoreRunCheckpoints, legacyNativeCheckpoint } from "../../src/platform/run-checkpoints.mjs";
import { createSyllablSession, serializeSyllablSession, hydrateSyllablSession } from "../../src/games/syllabl/engine.mjs";
import { serializeRaritySubmission, hydrateRaritySession } from "../../src/games/rarity/engine.mjs";
import { createBridgeSession, serializeBridgeSession, hydrateBridgeSession, submitBridgeAnswer } from "../../src/games/before-after/engine.mjs";
import { createTokenRun, serializeTokenRun, hydrateTokenRun } from "../../src/games/token/engine.mjs";
import { createDecodeState } from "../../src/games/decode/engine.mjs";
import { resumeDecodeCheckpoint } from "../../src/games/decode/resume.mjs";
import { createDualSession, serializeDualSession, hydrateDualSession, submitDualWord } from "../../src/games/dual/engine.mjs";
import { createDualLexicon } from "../../src/games/dual/lexicon.mjs";

const date = "2026-09-03", startedAt = `${date}T12:00:00.000Z`;
function store() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; }
function run(score = 1) { return { schemaVersion: 1, runId: "syllabl:daily:today", playerId: "mario", gameId: "syllabl", mode: "daily", puzzle: { id: `${date}-dra`, revision: 1, date }, startedAt, completedAt: null, outcome: "in-progress", score, result: { stagesCompleted: score, totalStages: 6, guesses: [] } }; }
function pristineDualRun(puzzleId, revision = 1) {
  return { schemaVersion: 1, runId: `dual:daily:${date}`, playerId: "mario", gameId: "dual", mode: "daily",
    puzzle: { id: puzzleId, revision, date }, startedAt, completedAt: null, outcome: "in-progress", score: 0,
    result: { score: 0, enScore: 0, esScore: 0, enFamilies: 0, esFamilies: 0, foundDuals: 0, totalDuals: 1, submissions: [] } };
}
function playedDualRun(score, submissions, syncRevision) {
  return { ...pristineDualRun("dual-puzzle"), score, syncRevision,
    result: { ...pristineDualRun("dual-puzzle").result, score, submissions } };
}
function decodeRun(score, syncRevision, outcome = "in-progress") {
  return { ...run(score), gameId: "decode", mode: "daily-5", runId: `decode:daily-5:${date}`,
    puzzle: { id: "decode-daily", revision: 1, date }, syncRevision,
    completedAt: outcome === "completed" ? startedAt : null, outcome,
    result: { score, signalsCompleted: score, elapsedSeconds: score * 10 },
    checkpoint: { version: 1, state: { native: { run: { mode: "daily-5", status: "playing", score, dailyIndex: score, elapsedSeconds: score * 10 } } } } };
}
function remote() {
  const runs = new Map();
  return { runs, async list({ gameId } = {}) { return [...runs.values()].filter((r) => !gameId || r.gameId === gameId); }, async get(id) { return runs.get(id) ?? null; }, async save(candidate) { const saved = prepareRunWrite(runs.get(candidate.runId), candidate); runs.set(saved.runId, saved); return saved; }, async remove(id) { runs.delete(id); } };
}
function sync(storage = store(), cloud = remote(), ownerId = "mario", onChange) { return createRunSync({ storage, remote: cloud, ownerId, onChange }); }

test("only acknowledged writes trigger save confirmations, never reads or idle polls", async () => {
  const states = [], cloud = remote();
  const queue = sync(store(), cloud, "mario", (state) => states.push(state));
  await queue.prepare("syllabl");
  assert.equal(states.at(-1).savedCount, 0);
  const count = states.length;
  await queue.flush();
  assert.equal(states.length, count);
  queue.stage(run());
  assert.equal(states.at(-1).savedCount, 0);
  await queue.flush();
  assert.equal(states.at(-1).status, "saved");
  assert.equal(states.at(-1).savedCount, 1);
  await queue.prepare("syllabl");
  await queue.flush();
  assert.equal(states.at(-1).savedCount, 1);
  queue.stage(run(2));
  await queue.flush();
  assert.equal(states.at(-1).savedCount, 2);
});

test("clearing a game removes its local journal and authoritative cloud runs", async () => {
  const storage = store(), cloud = remote();
  const queue = sync(storage, cloud);
  queue.stage(run(2));
  queue.stage({ ...run(1), runId: "other-game", gameId: "rarity", result: { submission: null } });
  await queue.flush();
  await queue.clearGame("syllabl");
  assert.equal(queue.list({ gameId: "syllabl" }).length, 0);
  assert.equal(queue.list({ gameId: "rarity" }).length, 1);
  assert.equal((await cloud.list({ gameId: "syllabl" })).length, 0);
  assert.equal((await cloud.list({ gameId: "rarity" })).length, 1);
});

test("failed saves do not report success and idle polls do not clear read errors", async () => {
  let state;
  const queue = sync(store(), {
    ...remote(),
    list: async () => { throw new TypeError("offline"); },
    save: async () => { throw new TypeError("offline"); },
  }, "mario", (value) => { state = value; });
  await queue.prepare("syllabl");
  await queue.flush();
  assert.equal(state.status, "offline");
  assert.equal(state.savedCount, 0);
  queue.stage(run());
  await queue.flush();
  assert.equal(state.status, "offline");
  assert.equal(state.savedCount, 0);
});

test("permanent cloud rejections are retained locally without retrying every checkpoint", async () => {
  let attempts = 0, state;
  const queue = sync(store(), {
    ...remote(),
    save: async () => { attempts += 1; const error = new Error("invalid run"); error.status = 400; throw error; },
  }, "mario", (value) => { state = value; });
  queue.stage(run(1));
  await queue.flush();
  assert.equal(attempts, 1);
  assert.equal(state.status, "rejected");
  assert.equal(state.pending, 0);
  queue.stage(run(2));
  await queue.flush();
  assert.equal(attempts, 1);
  assert.equal(queue.list()[0].score, 2);
  assert.equal(state.status, "rejected");
});

test("a stale conditional write can recreate a run after its server record disappears", async () => {
  const cloud = remote(); let attempts = 0;
  const queue = sync(store(), {
    ...cloud,
    save: async (candidate) => {
      attempts += 1;
      if (attempts === 1) { const error = new Error("Progress changed on another device."); error.status = 409; throw error; }
      return cloud.save(candidate);
    },
  });
  queue.stage(run(2));
  await queue.flush();
  await queue.flush();
  assert.equal(attempts, 2);
  assert.equal(queue.list()[0].score, 2);
  assert.equal((await cloud.list()).length, 1);
});

test("active clock ticks do not count as cloud progress changes", () => {
  const bridge = {
    ...run(), gameId: "before-after", mode: "packs", runId: "before-after:packs:clock",
    puzzle: { id: "clock", revision: 1 }, result: { attempts: 0, durationMs: 0, status: "active" },
    checkpoint: { version: 1, state: { native: { activeElapsedMs: 1000, resumedAt: 1000, answerText: "" } } },
  };
  const laterBridge = { ...bridge, checkpoint: { ...bridge.checkpoint, state: { native: { ...bridge.checkpoint.state.native, activeElapsedMs: 9000, resumedAt: 9000 } } } };
  assert.equal(runContent(bridge), runContent(laterBridge));

  const decode = {
    ...run(), gameId: "decode", mode: "daily-5", runId: "decode:daily-5:clock",
    puzzle: { id: "clock", revision: 1, date }, result: { score: 1, signalsCompleted: 1, elapsedSeconds: 2 },
    checkpoint: { version: 1, state: { native: { run: { status: "playing", score: 1, elapsedSeconds: 2 }, puzzle: {} } } },
  };
  const laterDecode = { ...decode, result: { ...decode.result, elapsedSeconds: 18 }, checkpoint: { ...decode.checkpoint, state: { native: { ...decode.checkpoint.state.native, run: { ...decode.checkpoint.state.native.run, elapsedSeconds: 18 } } } } };
  assert.equal(runContent(decode), runContent(laterDecode));
});

test("an account deletion marker disables older in-memory queues", async () => {
  const storage = store(); const cloud = remote();
  const queue = sync(storage, cloud);
  storage.setItem(runSyncResetKey("mario"), String(Date.now() + 1000));
  queue.stage(run(2));
  await queue.flush();
  assert.equal(queue.list().length, 0);
  assert.equal((await cloud.list()).length, 0);
});

test("an account deletion marker also discards an in-flight save response", async () => {
  const storage = store(); const cloud = remote(); let release;
  const saveStarted = new Promise((resolve) => { release = resolve; });
  const queue = sync(storage, {
    ...cloud,
    save: async (candidate) => { await saveStarted; return cloud.save(candidate); },
  });
  queue.stage(run(2));
  const flushing = queue.flush();
  storage.setItem(runSyncResetKey("mario"), String(Date.now() + 1000));
  release();
  await flushing;
  assert.equal(queue.list().length, 0);
  assert.equal((await cloud.list()).length, 1, "the already-started request may finish remotely");
});

test("account storage and queues never borrow guest or another player's progress", async () => {
  const storage = store(), cloud = remote();
  scopedProgressStorage(storage, null).setItem("daily", "guest");
  scopedProgressStorage(storage, "mario").setItem("daily", "mario");
  assert.equal(scopedProgressStorage(storage, "other").getItem("daily"), null);
  assert.equal(scopedProgressStorage(storage, null).getItem("daily"), "guest");
  const a = sync(storage, cloud); a.stage({ ...run(), playerId: "wrong" }); a.dispose();
  const b = sync(storage, cloud, "other"); await b.flush(); assert.equal(cloud.runs.size, 0);
  const resumed = sync(storage, cloud); await resumed.flush(); assert.equal(cloud.runs.values().next().value.playerId, "mario");
});

test("offline writes survive reload and retry with their original owner", async () => {
  const storage = store(), cloud = remote(); let state;
  const queue = sync(storage, { ...cloud, save: async () => { throw new TypeError("offline"); } }, "mario", (value) => { state = value; });
  queue.stage(run(2)); await queue.flush(); assert.equal(state.status, "offline"); queue.dispose();
  const restored = sync(storage, cloud); assert.equal(restored.list()[0].score, 2);
  await restored.flush(); assert.equal(cloud.runs.values().next().value.score, 2);
});

test("concurrent tabs preserve each other's journal records", async () => {
  const storage = store(), cloud = remote();
  const first = sync(storage, cloud), second = sync(storage, cloud);
  first.stage({ ...run(1), runId: "first-tab" });
  second.stage({ ...run(2), runId: "second-tab" });
  assert.deepEqual(sync(storage, cloud).list().map((entry) => entry.runId).sort(), ["first-tab", "second-tab"]);

  await first.flush();
  second.stage({ ...run(3), runId: "third-run" });
  const stored = JSON.parse(storage.getItem("mg-games:run-sync:v1:mario"));
  assert.deepEqual(Object.keys(stored.runs).sort(), ["first-tab", "second-tab", "third-run"]);
  assert.equal(stored.pending["first-tab"], undefined, "a stale tab must not resurrect an acknowledged write");
});

test("newer progress during an in-flight save is retained", async () => {
  const cloud = remote(); let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = sync(store(), { ...cloud, save: async (candidate) => { await gate; return cloud.save(candidate); } });
  queue.stage(run(1)); const pending = queue.flush(); queue.stage(run(2)); release(); await pending;
  assert.equal(queue.list()[0].score, 2); await queue.flush(); assert.equal(cloud.runs.values().next().value.score, 2);
});

test("stale writes require a choice; losing save is retained for recovery", async () => {
  const cloud = remote(), storage = store(); let state;
  const a = sync(store(), cloud), b = sync(storage, cloud, "mario", (value) => { state = value; });
  a.stage(run(1)); b.stage(run(2)); await a.flush(); await b.flush();
  assert.equal(state.conflicts.length, 1); assert.equal(cloud.runs.values().next().value.score, 1);
  assert.equal(state.pending, 0, "a conflicted snapshot must stop retrying until a choice is made");
  b.stage(run(3)); await b.flush();
  assert.equal(state.pending, 0, "clock or checkpoint updates must not requeue a conflict");
  b.resolve(run().runId, "device"); await b.flush(); assert.equal(cloud.runs.values().next().value.score, 3);
  assert.equal(JSON.parse(storage.getItem("mg-games:run-sync:v1:mario")).recovery[0].run.score, 1);
});

test("append-only DUAL progress rebases without surfacing a false conflict", async () => {
  const cloud = remote(), storage = store(); let state;
  const first = { surface: "total", languages: ["en", "es"], points: 2, submittedAt: startedAt };
  const second = { surface: "potato", languages: ["en"], points: 1, submittedAt: `${date}T12:01:00.000Z` };
  await cloud.save(playedDualRun(2, [first]));
  const queue = sync(storage, cloud, "mario", (value) => { state = value; });
  queue.stage(playedDualRun(3, [first, second]));
  await queue.flush();
  assert.equal(state.conflicts.length, 0);
  assert.equal(queue.list()[0].score, 3);
  await queue.flush();
  assert.equal(cloud.runs.values().next().value.score, 3);
});

test("append-only DECODE Daily progress rebases without surfacing a false conflict", async () => {
  const cloud = remote(), storage = store(); let state;
  await cloud.save(decodeRun(1));
  const queue = sync(storage, cloud, "mario", (value) => { state = value; });
  queue.stage(decodeRun(2));
  await queue.flush();
  assert.equal(state.conflicts.length, 0);
  assert.equal(queue.list()[0].score, 2);
  await queue.flush();
  assert.equal(cloud.runs.values().next().value.score, 2);
});

test("DECODE Daily completion rebases over a stale in-progress cloud run", async () => {
  const cloud = remote(), storage = store(); let state;
  await cloud.save(decodeRun(4));
  const queue = sync(storage, cloud, "mario", (value) => { state = value; });
  queue.stage(decodeRun(5, undefined, "completed"));
  await queue.flush();
  assert.equal(state.conflicts.length, 0);
  await queue.flush();
  assert.equal(cloud.runs.values().next().value.score, 5);
  assert.equal(cloud.runs.values().next().value.outcome, "completed");
});

test("divergent DUAL submissions still require a progress choice", async () => {
  const cloud = remote(); let state;
  const cloudWord = { surface: "total", languages: ["en", "es"], points: 2, submittedAt: startedAt };
  const deviceWord = { surface: "potato", languages: ["en"], points: 1, submittedAt: startedAt };
  await cloud.save(playedDualRun(2, [cloudWord]));
  const queue = sync(store(), cloud, "mario", (value) => { state = value; });
  queue.stage(playedDualRun(1, [deviceWord]));
  await queue.flush();
  assert.equal(state.conflicts.length, 1);
});

test("cloud choice hydrates the remote snapshot and completed records cannot be replaced", async () => {
  const cloud = remote(); const complete = { ...run(6), completedAt: startedAt, outcome: "completed" };
  await cloud.save(complete); const queue = sync(store(), cloud); queue.stage(run(1)); await queue.prepare("syllabl");
  assert.throws(() => queue.resolve(run().runId, "device"), /final/);
  queue.resolve(run().runId, "cloud"); queue.stage(run(2)); assert.equal(queue.list()[0].score, 6);
});

test("a pristine same-day DUAL replacement does not become a progress conflict", async () => {
  const cloud = remote(), storage = store(); let state;
  await cloud.save(pristineDualRun("old-puzzle"));
  const queue = sync(storage, cloud, "mario", (value) => { state = value; });
  queue.stage(pristineDualRun("replacement-puzzle", 2));
  await queue.prepare("dual");
  assert.equal(state.conflicts.length, 0);
  assert.equal(queue.list()[0].puzzle.id, "old-puzzle");
  const journal = JSON.parse(storage.getItem("mg-games:run-sync:v1:mario"));
  assert.equal(journal.recovery.at(-1).run.puzzle.id, "replacement-puzzle");
});

test("lost HTTP acknowledgement retries idempotently, without a conflict", async () => {
  const cloud = remote(); let first = true, state;
  const queue = sync(store(), { ...cloud, save: async (candidate) => { const saved = await cloud.save(candidate); if (first) { first = false; throw new TypeError("response lost"); } return saved; } }, "mario", (value) => { state = value; });
  queue.stage(run()); await queue.flush(); await queue.flush();
  assert.equal(state.pending, 0); assert.equal(state.conflicts.length, 0); assert.equal(queue.list()[0].syncRevision, 1);
});

test("server revisions guard stale writes and changes to run identity", () => {
  const saved = prepareRunWrite(undefined, run());
  assert.equal(saved.syncRevision, 1);
  assert.equal(prepareRunWrite(saved, run()), saved);
  assert.throws(() => prepareRunWrite(saved, run(2)), /another device/);
  for (const changes of [{ playerId: "other" }, { mode: "archive" }, { puzzle: { id: "another", revision: 1 } }, { startedAt: `${date}T13:00:00Z` }]) {
    assert.throws(() => prepareRunWrite(saved, { ...run(2), syncRevision: 1, ...changes }), /cannot change/);
  }
});

test("storage failures remain visible rather than claiming durable saves", () => {
  let state; const queue = sync({ getItem: () => null, setItem: () => { throw Error("quota"); } }, remote(), "mario", (value) => { state = value; });
  queue.stage(run()); assert.equal(state.status, "storage-error"); assert.equal(queue.list().length, 1);
});

test("native Syllabl, Rarity, bridge, TOKEN and DUAL checkpoints hydrate through their actual engines", () => {
  const storage = store();
  const project = (gameId, native, puzzleId, mode = "daily") => restoreRunCheckpoints(storage, [{ ...run(), gameId, mode, puzzle: { id: puzzleId, revision: 1, date }, checkpoint: { version: 1, state: { native } } }]);
  const syllablPuzzle = { puzzleLetters: "dra", inputsEnabled: [2,2,2,2,2,2], syllablesRequired: [2,2,2,2,2,2] };
  const syllabl = { ...createSyllablSession({ puzzle: syllablPuzzle, puzzleDate: date }), currentStage: 1, guesses: [{ word: "dragon", syllables: 2, syllableList: ["drag", "on"] }] };
  project("syllabl", serializeSyllablSession(syllabl), `${date}-dra`);
  const restoredSyllabl = hydrateSyllablSession({ stored: JSON.parse(storage.getItem(`mg-games:v2:syllabl:daily-${date}`)), puzzle: syllablPuzzle, puzzleDate: date });
  assert.equal(restoredSyllabl.currentStage, 1);
  const submission = { word: "dragon", exactScore: 2, tier: 1, frequency: .01, timestamp: startedAt };
  project("rarity", serializeRaritySubmission("dra", submission), `${date}-dra`);
  assert.equal(hydrateRaritySession({ payload: JSON.parse(storage.getItem(`rarity_daily_${date}`)), puzzle: { puzzleString: "dra" }, puzzleDate: date }).submission.word, "dragon");
  const bridgePuzzle = { id: "bridge", clueWords: ["days", "hot"], answer: "dog", position: "both" };
  const bridge = { ...createBridgeSession({ puzzle: bridgePuzzle, mode: "archive", startedAt: Date.parse(startedAt) }), attempts: 2 };
  project("before-after", serializeBridgeSession(bridge), "bridge", "archive");
  assert.equal(hydrateBridgeSession({ payload: JSON.parse(storage.getItem("mg-games:v1:before-after:resume-bridge")), puzzle: bridgePuzzle, mode: "archive" }).attempts, 2);
  const tokenPuzzle = { id: "token", responseTokens: ["a", "b", "c"], stops: [{ index: 1 }] };
  const token = { ...createTokenRun(tokenPuzzle), cursor: 1, startedAt };
  project("token", JSON.parse(serializeTokenRun(token)), "token", "daily-easy");
  assert.equal(hydrateTokenRun(JSON.parse(storage.getItem("mg-games:v1:token:runs")).runs.token, tokenPuzzle).cursor, 1);
  const dualPuzzle = { id: "dual", sequence: "OTA", targetScore: 2, minimumEnglish: 1, minimumSpanish: 1, dualCount: 1 };
  const lexicon = createDualLexicon(["total", "quota"].map((surface) => ({ surface, senses: (surface === "total" ? ["en", "es"] : ["en"]).map((language) => ({ language, lemma: surface, formKind: "lemma" })), policy: { accepted: true, loanwordStatus: "none" }, source: { kind: "curated-fixture" } })));
  const dual = submitDualWord({ session: createDualSession({ puzzle: dualPuzzle, dateKey: date }), puzzle: dualPuzzle, lexicon, input: "total", now: Date.parse(startedAt) }).state;
  project("dual", serializeDualSession(dual), "dual");
  const restoredDual = hydrateDualSession({ payload: JSON.parse(storage.getItem("mg-games:v1:dual:runs"))[date], puzzle: dualPuzzle, lexicon, dateKey: date });
  assert.equal(restoredDual.solvedAt, dual.solvedAt); assert.equal(restoredDual.allDualsFoundAt, dual.allDualsFoundAt);
  assert.equal(submitDualWord({ session: restoredDual, puzzle: dualPuzzle, lexicon, input: "quota" }).accepted, true);
});

test("completed Before&After cloud runs rebuild the menu and archive progress index", () => {
  const storage = store();
  const native = serializeBridgeSession(submitBridgeAnswer(createBridgeSession({ puzzle: { id: "bridge-cloud", clueWords: ["air", "fire"], answer: "open", position: "before" }, mode: "daily", startedAt: Date.parse(startedAt) }), "open", Date.parse(startedAt) + 12_000).state);
  restoreRunCheckpoints(storage, [{ ...run(), gameId: "before-after", mode: "daily", puzzle: { id: "bridge-cloud", revision: 1, date }, outcome: "completed", completedAt: `${date}T12:00:12.000Z`, score: 1, checkpoint: { version: 1, state: { native } }, result: { attempts: 1, durationMs: 12_000, status: "solved" } }]);
  const progress = JSON.parse(storage.getItem("mg-games:v1:before-after:progress"));
  assert.equal(progress.solved[`daily:${date}`].durationMs, 12_000);
  assert.deepEqual(progress.dailyDates, [date]);
});

test("Before&After reset markers prevent stale cloud checkpoints from rebuilding cleared progress", () => {
  const storage = store();
  storage.setItem("mg-games:v1:before-after:cloud-reset", "2026-09-04T00:00:00.000Z");
  restoreRunCheckpoints(storage, [{ ...run(), gameId: "before-after", mode: "daily", puzzle: { id: "old-bridge", revision: 1, date }, outcome: "completed", completedAt: `${date}T12:00:12.000Z`, result: { attempts: 1, durationMs: 12_000, status: "solved" } }]);
  assert.equal(storage.getItem("mg-games:v1:before-after:progress"), null);
  assert.equal(storage.getItem("mg-games:v1:before-after:daily"), null);
});

test("DECODE resumes only its paused Daily without charging time spent away", () => {
  const storage = store(), puzzle = { id: "test", answer: "BEAR", clueWord: "BARE", clue: "Animal" };
  for (const mode of ["timed", "daily-5", "zen"]) {
    const native = { run: createDecodeState(mode), puzzle, runMeta: { startedAt, puzzleId: "decode-test" }, dailyPuzzles: Array(5).fill(puzzle), zenLength: 4 };
    restoreRunCheckpoints(storage, [{ ...run(), gameId: "decode", mode, updatedAt: startedAt, checkpoint: { version: 1, state: { native } } }]);
    const raw = storage.getItem(`mg-games:v1:decode:resume-${mode}`);
    const restored = resumeDecodeCheckpoint(raw, mode, date, Date.parse(startedAt) + 7000);
    if (mode === "daily-5") {
      assert.ok(restored);
      assert.equal(restored.run.elapsedSeconds, 0);
      assert.equal(resumeDecodeCheckpoint(raw, mode, "2026-09-04"), null);
    } else assert.equal(restored, null);
  }
  const completed = { date, outcome: "completed", updatedAt: startedAt, native: {
    run: { mode: "daily-5", status: "complete", score: 5, dailyIndex: 5, elapsedSeconds: 40 },
    puzzle, runMeta: { startedAt, puzzleId: "daily" }, zenLength: 4, dailyPuzzles: Array(5).fill(puzzle),
  } };
  assert.equal(resumeDecodeCheckpoint(JSON.stringify(completed), "daily-5", date, Date.parse(startedAt) + 300000).run.elapsedSeconds, 40);
});

test("legacy result recovery is conservative and does not invent missing state", () => {
  assert.equal(legacyNativeCheckpoint({ ...run(), gameId: "decode" }), null);
  assert.equal(legacyNativeCheckpoint({ ...run(), gameId: "token" }), null);
  assert.equal(legacyNativeCheckpoint({ ...run(), gameId: "dual", result: { submissions: [] } }).version, 2);
  const storage = store(); restoreRunCheckpoints(storage, [{ ...run(), checkpoint: { version: 1, state: { storageKey: "auth-token", native: {} } } }]);
  assert.equal(storage.getItem("auth-token"), null);
});
