import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_DAILY_EPOCH,
  catalogDateKey,
  dailyCatalogIndex,
  dailyCatalogOffset,
} from "../../src/platform/daily-calendar.mjs";

test("all catalog rotations share one temporary September 1 epoch", () => {
  assert.equal(CURRENT_DAILY_EPOCH, "2026-09-01");
  assert.equal(dailyCatalogOffset("2026-09-03"), 2);
  assert.equal(dailyCatalogIndex("2026-09-03", 2), 0);
  assert.equal(catalogDateKey(34), "2026-10-05");
});
