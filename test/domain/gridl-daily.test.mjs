import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  gridlDailyLevelId,
  hashGridlDate,
} from "../../src/games/gridl/daily.mjs";
import { repositoryRoot } from "../../src/support/paths.mjs";

const authoredLevelIds = fs
  .readdirSync(path.join(repositoryRoot, "public", "gridl", "levels"))
  .filter((file) => /^level-\d{3}\.json$/.test(file))
  .map((file) => file.match(/\d{3}/)[0])
  .sort();

test("Gridl daily selection is deterministic across sessions", () => {
  assert.equal(hashGridlDate("2026-08-07"), hashGridlDate("2026-08-07"));
  assert.equal(
    gridlDailyLevelId("2026-08-07", authoredLevelIds),
    gridlDailyLevelId("2026-08-07", authoredLevelIds),
  );
});

test("Gridl daily selection only returns migrated authored levels", () => {
  assert.equal(authoredLevelIds.length, 31);
  for (let day = 1; day <= 31; day += 1) {
    const id = gridlDailyLevelId(
      `2026-08-${String(day).padStart(2, "0")}`,
      authoredLevelIds,
    );
    assert.ok(authoredLevelIds.includes(id));
    const raw = fs.readFileSync(
      path.join(repositoryRoot, "public", "gridl", "levels", `level-${id}.json`),
      "utf8",
    );
    assert.doesNotMatch(raw, /placeholder/i);
  }
});

test("Gridl daily selection rejects an empty level pool", () => {
  assert.throws(
    () => gridlDailyLevelId("2026-08-07", []),
    /requires at least one authored level/,
  );
});
