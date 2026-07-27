import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repositoryRoot } from "../src/support/paths.mjs";

const catalog = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "catalog.json"), "utf8"),
);

test("launch catalog is ordered and stable", () => {
  assert.deepEqual(
    catalog.launch.map(({ priority, id }) => ({ priority, id })),
    [
      { priority: 1, id: "syllabl" },
      { priority: 2, id: "rarity" },
      { priority: 3, id: "gridl" },
      { priority: 4, id: "expl41n" },
      { priority: 5, id: "before-after" },
    ],
  );
});

test("retired and separate products cannot leak into launch", () => {
  const launchIds = new Set(catalog.launch.map((game) => game.id));
  assert.equal(launchIds.has("gemboard"), false);
  assert.equal(launchIds.has("plotter"), false);
  assert.ok(catalog.retired.some((game) => game.id === "gemboard"));
  assert.ok(
    catalog.separateProducts.some((product) => product.id === "plotter"),
  );
});
