import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { repositoryRoot } from "../src/support/paths.mjs";

const catalog = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "catalog.json"), "utf8"),
);

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.launch.length, 8);

const priorities = catalog.launch.map((game) => game.priority);
assert.deepEqual(priorities, [1, 2, 3, 4, 5, 6, 7, 8]);

const launchIds = catalog.launch.map((game) => game.id);
assert.equal(new Set(launchIds).size, launchIds.length);
assert.deepEqual(launchIds, [
  "syllabl",
  "rarity",
  "before-after",
  "decode",
  "token",
  "dual",
  "expl41n",
  "gridl",
]);

for (const game of catalog.launch) {
  assert.match(game.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(game.name);
  assert.match(game.repository, /^[^/]+\/[^/]+$/);
  assert.ok(["live", "live-preview", "coming-soon"].includes(game.hubStatus));
}

assert.ok(!launchIds.includes("gemboard"));
assert.ok(catalog.retired.some((game) => game.id === "gemboard"));
assert.ok(
  catalog.separateProducts.some((product) => product.id === "plotter"),
);

console.log("Catalog check passed: 8 launch games, Gemboard retired.");
