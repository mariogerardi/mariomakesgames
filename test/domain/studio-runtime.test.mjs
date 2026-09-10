import assert from "node:assert/strict";
import test from "node:test";
import { createStudioRuntime } from "../../src/authoring/studio-runtime.mjs";
import { validateSyllablPlacement } from "../../src/games/syllabl/engine.mjs";

const date = "2026-09-04";
const slots = [["syllabl", "daily"], ["rarity", "daily"], ["before-after", "daily"], ["decode", "daily-5"], ["token", "daily-easy"], ["token", "daily-hard"], ["dual", "daily"]];
function fixture() {
  const puzzles = slots.map(([gameId, mode]) => ({ gameId, id: `${gameId}-${mode}`, revision: 2, payload: { mode } }));
  const schedule = { entries: slots.map(([gameId, mode], index) => ({ gameId, mode, date, puzzles: [{ puzzleId: puzzles[index].id, revision: 2 }] })) };
  return { puzzles, schedule };
}
function server(data, calls = []) {
  return async (url) => { calls.push(url); return { ok: true, json: async () => url.includes("/schedule") ? { schedule: data.schedule } : { puzzles: data.puzzles } }; };
}

test("every game's Daily slot resolves its exact Studio assignment; TOKEN difficulties stay separate", async () => {
  const data = fixture(), calls = [];
  const runtime = createStudioRuntime({ fetcher: server(data, calls), promoted: { puzzles: [], schedule: { entries: [] } } });
  const selected = await Promise.all(slots.map(([gameId, mode]) => runtime.loadSlot(gameId, mode, date)));
  selected.forEach((selection, index) => assert.deepEqual(selection, [data.puzzles[index]]));
  assert.equal(calls.filter((url) => url.includes("/schedule")).length, 1);
  assert.equal(calls.filter((url) => url.endsWith("gameId=token")).length, 1);
  assert.notEqual(selected[4][0].id, selected[5][0].id);
});

test("new requests see schedule edits rather than a permanently cached assignment", async () => {
  const data = fixture(), runtime = createStudioRuntime({ fetcher: server(data), promoted: fixture() });
  await runtime.loadSlot("syllabl", "daily", date);
  data.puzzles.push({ ...data.puzzles[0], revision: 3 });
  data.schedule.entries[0].puzzles[0].revision = 3;
  assert.equal((await runtime.loadSlot("syllabl", "daily", date))[0].revision, 3);
});

test("deployed/offline runtime uses promoted schedules; unassigned dates return no override", async () => {
  const promoted = fixture();
  const runtime = createStudioRuntime({ fetcher: async () => { throw Error("local Studio unavailable"); }, promoted });
  assert.deepEqual(await runtime.loadSlot("rarity", "daily", date), [promoted.puzzles[1]]);
  assert.deepEqual(await runtime.loadSlot("rarity", "daily", "2026-09-05"), []);
});

test("missing immutable references cannot serve a partial DECODE edition or substitute a different revision", async () => {
  const data = fixture();
  data.schedule.entries[3].puzzles.push({ puzzleId: "missing-step", revision: 1 });
  data.schedule.entries[0].puzzles[0].revision = 1;
  const runtime = createStudioRuntime({ fetcher: server(data), promoted: fixture() });
  assert.deepEqual(await runtime.loadSlot("decode", "daily-5", date), []);
  assert.deepEqual(await runtime.loadSlot("syllabl", "daily", date), []);
});

test("Syllabl's PRO example uses begins-with; fully contains retains the strict interior rule", () => {
  assert.equal(validateSyllablPlacement("procrastinator", "pro", 2), true);
  assert.equal(validateSyllablPlacement("procrastinator", "pro", 3), false);
  assert.equal(validateSyllablPlacement("reproach", "pro", 3), true);
});
