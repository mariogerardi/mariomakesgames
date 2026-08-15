import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  calculateRarityScore,
  determineRarityTier,
  validateRarityLocalRules,
} from "../../src/contracts/rarity.mjs";
import { resolveDeveloperPath } from "../../src/support/paths.mjs";
import { readFixture } from "../helpers/fixtures.mjs";
import { loadLegacyFunction } from "../helpers/legacy-function.mjs";

const rarityRoot = resolveDeveloperPath("games/rarity");

if (!fs.existsSync(rarityRoot)) {
  test.skip("Rarity legacy parity checks require a sibling games/rarity repo", () => {});
} else {
  const legacyScoring = await import(
    pathToFileURL(path.join(rarityRoot, "backend/lib/wordScoring.mjs")).href,
  );
  const legacyLocalRules = loadLegacyFunction(
    path.join(rarityRoot, "js/core/daily/game-view.js"),
    "validateLocalRules",
  );

test("Rarity score contract matches the backend oracle", () => {
  for (const fixture of readFixture("rarity/frequency-scores.json")) {
    const contract = calculateRarityScore(fixture.frequency);
    const legacy = legacyScoring.calculateRarityScore(fixture.frequency);
    assert.deepEqual(contract, legacy);
    assert.equal(
      determineRarityTier(contract.score),
      legacyScoring.determineTierFromScore(legacy.score),
    );
  }
});

test("Rarity local acceptance matches the legacy validator", () => {
  const cases = [
    ["str", "str"],
    ["str33t", "str"],
    ["rare", "str"],
    ["street", "STR"],
  ];

  for (const [word, token] of cases) {
    assert.equal(
      validateRarityLocalRules(word, token).valid,
      legacyLocalRules(word, token).valid,
    );
  }
});
}
