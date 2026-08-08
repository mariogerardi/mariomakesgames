import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPL41N_MASCOT_STATES,
  expl41nMascotState,
} from "../../src/games/expl41n/presentation.mjs";

test("Expl41n presentation maps every preserved emotion into the new mascot", () => {
  assert.equal(EXPL41N_MASCOT_STATES.length, 11);
  assert.equal(expl41nMascotState(), "idle");
  assert.equal(expl41nMascotState({ isThinking: true }), "thinking");
  assert.equal(expl41nMascotState({ isSleepy: true }), "sleepy");
  assert.equal(
    expl41nMascotState({ hasAttempt: true, confidence: 5 }),
    "frustrated",
  );
  assert.equal(
    expl41nMascotState({ hasAttempt: true, confidence: 25 }),
    "confused",
  );
  assert.equal(
    expl41nMascotState({ hasAttempt: true, confidence: 45 }),
    "suspicious",
  );
  assert.equal(
    expl41nMascotState({ hasAttempt: true, confidence: 55 }),
    "skeptical",
  );
  assert.equal(
    expl41nMascotState({ hasAttempt: true, confidence: 75 }),
    "confident",
  );
  assert.equal(
    expl41nMascotState({ hasAttempt: true, confidence: 95 }),
    "surprised",
  );
  assert.equal(expl41nMascotState({ status: "won" }), "victory");
  assert.equal(expl41nMascotState({ status: "lost" }), "defeat");
});
