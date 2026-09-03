import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalTokenLibraryEntry,
  parseLocalTokenLibrary,
  selectDailyTokenPuzzle,
  serializeLocalTokenLibrary,
  tokenDateKey,
  upsertLocalTokenLibraryEntry,
} from "../../src/games/token/library.mjs";

function puzzle(id, difficulty) {
  return {
    difficulty,
    id,
    prompt: "A valid TOKEN fixture.",
    responseTokens: ["A", "response."],
    schemaVersion: 1,
    stops: [{ candidates: [{ token: "The", score: 44 }], index: 1, token: "response" }],
    tokenizer: { id: "test", note: "test fixture" },
  };
}

const testPuzzles = [
  puzzle("easy-1", "easy"),
  puzzle("easy-2", "easy"),
  puzzle("hard-1", "hard"),
  puzzle("hard-2", "hard"),
];

test("TOKEN daily selection is date-stable and keeps Easy and Hard separate", () => {
  const firstEasy = selectDailyTokenPuzzle(testPuzzles, { date: "2026-09-01", difficulty: "easy" });
  const firstHard = selectDailyTokenPuzzle(testPuzzles, { date: "2026-09-01", difficulty: "hard" });
  const nextEasy = selectDailyTokenPuzzle(testPuzzles, { date: "2026-09-02", difficulty: "easy" });

  assert.equal(firstEasy?.puzzle.difficulty, "easy");
  assert.equal(firstHard?.puzzle.difficulty, "hard");
  assert.notEqual(firstEasy?.puzzle.id, nextEasy?.puzzle.id);
  assert.equal(tokenDateKey("2026-09-01"), "2026-09-01");
});

test("TOKEN local archive only persists complete puzzles and replaces matching saves", () => {
  const first = createLocalTokenLibraryEntry({
    dailyDate: "2026-08-30",
    puzzle: testPuzzles[0],
    title: "First save",
    savedAt: "2026-08-29T12:00:00.000Z",
  });
  const updated = upsertLocalTokenLibraryEntry([first], {
    dailyDate: "not-a-date",
    puzzle: testPuzzles[0],
    title: "Updated save",
    savedAt: "2026-08-29T13:00:00.000Z",
  });
  const restored = parseLocalTokenLibrary(serializeLocalTokenLibrary(updated));

  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, "Updated save");
  assert.equal(restored[0].dailyDate, null);
  assert.equal(restored[0].puzzle.id, testPuzzles[0].id);
  assert.deepEqual(parseLocalTokenLibrary("{bad json"), []);
});
