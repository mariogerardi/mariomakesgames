import assert from "node:assert/strict";
import test from "node:test";
import { createDualSession, serializeDualSession } from "../../src/games/dual/engine.mjs";
import { parseDualRunLibrary, upsertDualRun } from "../../src/games/dual/library.mjs";

const puzzle = { id: "ota-001", sequence: "OTA", targetScore: 12, minimumEnglish: 5, minimumSpanish: 5, dualCount: 2 };

test("DUAL run libraries keep only dated object records", () => {
  const parsed = parseDualRunLibrary(JSON.stringify({
    "2026-08-30": { puzzleId: "ota-001" },
    nope: { puzzleId: "bad" },
    "2026-08-29": null,
  }));
  assert.deepEqual(parsed, { "2026-08-30": { puzzleId: "ota-001" } });
  assert.deepEqual(parseDualRunLibrary("{"), {});
});

test("DUAL run libraries replace one date without disturbing other rounds", () => {
  const session = createDualSession({ puzzle, dateKey: "2026-08-30" });
  const next = upsertDualRun({ "2026-08-29": { puzzleId: "tra-001" } }, session, serializeDualSession(session));
  assert.equal(next["2026-08-29"].puzzleId, "tra-001");
  assert.equal(next["2026-08-30"].puzzleId, "ota-001");
});
