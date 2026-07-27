import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { resolveDeveloperPath } from "../../src/support/paths.mjs";
import { readFixture } from "../helpers/fixtures.mjs";

const gridlRoot = resolveDeveloperPath("games/wordgrid");
const importLegacy = (relativePath) =>
  import(pathToFileURL(path.join(gridlRoot, relativePath)).href);

const stateEngine = await importLegacy("public/engine/state.js");
const rulesEngine = await importLegacy("public/engine/rules.js");
const levelEngine = await importLegacy("public/engine/levelLoader.js");

test("Gridl golden level 101 completes CAT at par", () => {
  const trace = readFixture("gridl/level-101-trace.json");
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(
        gridlRoot,
        `public/levels/level-${trace.levelId}.json`,
      ),
      "utf8",
    ),
  );
  const level = levelEngine.normalizeLevel(raw, trace.levelId);
  const state = stateEngine.initState(level);
  stateEngine.startLevel(state, level);

  assert.deepEqual(
    state.hand.map((tile) => tile.text),
    trace.initialHand,
  );

  let result;
  for (const action of trace.actions) {
    if (action.type === "place") {
      const tile = state.hand.find(
        (candidate) => candidate.text === action.fragment,
      );
      assert.ok(tile, `missing ${action.fragment} in hand`);
      result = rulesEngine.tryStagePlacement(
        state,
        tile.id,
        action.row,
        action.col,
      );
      assert.equal(result.ok, true);
    }
    if (action.type === "commit") {
      result = rulesEngine.commitPlayTurn(state);
    }
  }

  assert.equal(result.ok, true);
  assert.equal(result.win, trace.expected.win);
  assert.equal(state.turn - 1, trace.expected.turnsUsed);
  assert.equal(state.par, trace.expected.par);
  assert.equal(
    stateEngine.extractRuns(state).some((run) => run.text === "cat"),
    true,
  );
});

test("Gridl enforces one row or column for multi-placement turns", () => {
  const { state } = startCustomLevel({
    rows: 3,
    cols: 3,
    goal: { r: 2, c: 2 },
    seeds: [{ text: "A", r: 0, c: 0, dir: "H" }],
    deck: ["B", "C"],
    startingHand: ["B", "C"],
    allowedWords: ["a", "b", "c", "ab", "abc"],
  });

  assert.equal(
    rulesEngine.tryStagePlacement(state, state.hand[0].id, 0, 1).ok,
    true,
  );
  const diagonal = rulesEngine.tryStagePlacement(
    state,
    state.hand[0].id,
    1,
    2,
  );
  assert.equal(diagonal.ok, false);
  assert.match(diagonal.reason, /row 1 or column B/);
});

test("Gridl allows one fragment to complete two valid crossing words", () => {
  const { state } = startCustomLevel({
    rows: 3,
    cols: 3,
    goal: { r: 1, c: 1 },
    seeds: [
      { text: "C", r: 1, c: 0, dir: "H" },
      { text: "T", r: 1, c: 2, dir: "H" },
      { text: "B", r: 0, c: 1, dir: "V" },
      { text: "T", r: 2, c: 1, dir: "V" },
    ],
    deck: ["A"],
    startingHand: ["A"],
    allowedWords: ["cat", "bat"],
  });

  assert.equal(
    rulesEngine.tryStagePlacement(state, state.hand[0].id, 1, 1).ok,
    true,
  );
  const result = rulesEngine.commitPlayTurn(state);
  assert.deepEqual(result, { ok: true, win: true });
  assert.deepEqual(
    stateEngine
      .extractRuns(state)
      .filter((run) => run.cells >= 2)
      .map((run) => run.text)
      .sort(),
    ["bat", "cat"],
  );
});

test("Gridl rejects the whole board when one crossing is not allowed", () => {
  const { state } = startCustomLevel({
    rows: 3,
    cols: 3,
    goal: { r: 1, c: 1 },
    seeds: [
      { text: "C", r: 1, c: 0, dir: "H" },
      { text: "T", r: 1, c: 2, dir: "H" },
      { text: "B", r: 0, c: 1, dir: "V" },
      { text: "T", r: 2, c: 1, dir: "V" },
    ],
    deck: ["A"],
    startingHand: ["A"],
    allowedWords: ["cat"],
  });

  rulesEngine.tryStagePlacement(state, state.hand[0].id, 1, 1);
  const result = rulesEngine.commitPlayTurn(state);
  assert.equal(result.ok, false);
  assert.match(result.reason, /"BAT" is not allowed/);
  assert.equal(state.turn, 1);
});

test("Gridl blocks placement on blocked cells", () => {
  const { state } = startCustomLevel({
    rows: 2,
    cols: 2,
    goal: { r: 1, c: 1 },
    seeds: [{ text: "A", r: 0, c: 0, dir: "H" }],
    deck: ["B"],
    startingHand: ["B"],
    allowedWords: ["a", "ab"],
    board: { specials: [{ r: 0, c: 1, type: "blocked" }] },
  });

  const result = rulesEngine.tryStagePlacement(
    state,
    state.hand[0].id,
    0,
    1,
  );
  assert.deepEqual(result, {
    ok: false,
    reason: "That cell is blocked.",
  });
});

test("Gridl recall consumes a turn and moves a committed tile to reserve", () => {
  const { state } = startCustomLevel({
    rows: 2,
    cols: 2,
    goal: { r: 1, c: 1 },
    seeds: [{ text: "A", r: 0, c: 0, dir: "H" }],
    deck: ["B"],
    startingHand: ["B"],
    allowedWords: ["a", "ab"],
  });

  const tileId = state.hand[0].id;
  rulesEngine.tryStagePlacement(state, tileId, 0, 1);
  assert.deepEqual(rulesEngine.commitPlayTurn(state), {
    ok: true,
    win: false,
  });
  assert.equal(state.turn - 1, 1);

  assert.equal(rulesEngine.tryStageRecall(state, tileId).ok, true);
  assert.deepEqual(rulesEngine.commitRecallTurn(state), { ok: true });
  assert.equal(state.turn - 1, 2);
  assert.deepEqual(
    state.reserve.map((tile) => tile.text),
    ["B"],
  );
  assert.equal(state.grid[0][1].text, null);
});

test("Gridl enforces the two-slot reserve limit", () => {
  const { state } = startCustomLevel({
    rows: 2,
    cols: 2,
    goal: { r: 1, c: 1 },
    seeds: [{ text: "A", r: 0, c: 0, dir: "H" }],
    deck: ["B"],
    startingHand: ["B"],
    allowedWords: ["a", "ab"],
  });

  const tileId = state.hand[0].id;
  rulesEngine.tryStagePlacement(state, tileId, 0, 1);
  rulesEngine.commitPlayTurn(state);
  state.reserve = [
    { id: "R1", text: "X" },
    { id: "R2", text: "Y" },
  ];
  rulesEngine.tryStageRecall(state, tileId);

  const result = rulesEngine.commitRecallTurn(state);
  assert.deepEqual(result, {
    ok: false,
    reason: "Reserve is full (max 2).",
  });
});

test("Gridl portals project text, bridge connectivity, and cover the goal", () => {
  const { state } = startCustomLevel({
    rows: 3,
    cols: 3,
    goal: { r: 0, c: 2 },
    seeds: [{ text: "CA", r: 0, c: 1, dir: "H" }],
    deck: ["RE"],
    startingHand: ["RE"],
    allowedWords: ["care", "re"],
    board: {
      specials: [
        { r: 0, c: 2, type: "portal", group: "A" },
        { r: 2, c: 0, type: "portal", group: "A" },
      ],
    },
  });

  rulesEngine.tryStagePlacement(state, state.hand[0].id, 2, 0);
  assert.equal(stateEngine.getPortalOverlayText(state, 0, 2), "RE");
  assert.deepEqual(rulesEngine.commitPlayTurn(state), {
    ok: true,
    win: true,
  });
});

test("Gridl normalizes every level and identifies placeholder content", () => {
  const levelsDirectory = path.join(gridlRoot, "public/levels");
  const files = fs
    .readdirSync(levelsDirectory)
    .filter((file) => /^level-.*\.json$/.test(file))
    .sort();
  let placeholderCount = 0;

  for (const file of files) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(levelsDirectory, file), "utf8"),
    );
    assert.doesNotThrow(() => levelEngine.normalizeLevel(raw));
    if (/placeholder/i.test(`${raw.notes || ""} ${raw.meta?.intro || ""}`)) {
      placeholderCount += 1;
    }
  }

  assert.equal(files.length, 210);
  assert.equal(placeholderCount, 179);
  assert.equal(files.length - placeholderCount, 31);
});

test(
  "Gridl preserves a portal cell's special state when moving a staged tile",
  { todo: "Known legacy defect: moveStagedPlacement drops cell.special" },
  () => {
    const { state } = startCustomLevel({
      rows: 2,
      cols: 2,
      goal: { r: 1, c: 1 },
      seeds: [{ text: "A", r: 0, c: 0, dir: "H" }],
      deck: ["B"],
      startingHand: ["B"],
      allowedWords: ["a", "ab"],
      board: {
        specials: [
          { r: 0, c: 1, type: "portal", group: "A" },
          { r: 1, c: 1, type: "portal", group: "A" },
        ],
      },
    });

    const tileId = state.hand[0].id;
    rulesEngine.tryStagePlacement(state, tileId, 0, 1);
    rulesEngine.moveStagedPlacement(state, tileId, 1, 0);
    assert.equal(state.grid[0][1].special, "portal");
  },
);

function startCustomLevel(overrides) {
  const level = {
    id: "contract",
    name: "Contract fixture",
    rows: overrides.rows,
    cols: overrides.cols,
    par: overrides.par ?? 3,
    goal: overrides.goal,
    seeds: overrides.seeds,
    deck: overrides.deck,
    startingHand: overrides.startingHand,
    allowedWords: overrides.allowedWords,
    board: overrides.board ?? { specials: [] },
  };
  const state = stateEngine.initState(level);
  stateEngine.startLevel(state, level);
  return { level, state };
}
