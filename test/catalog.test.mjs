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
      { priority: 3, id: "before-after" },
      { priority: 4, id: "decode" },
      { priority: 5, id: "token" },
      { priority: 6, id: "dual" },
      { priority: 7, id: "expl41n" },
      { priority: 8, id: "gridl" },
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

test("catalog publication status matches the public hub", () => {
  const statusById = Object.fromEntries(
    catalog.launch.map(({ id, hubStatus }) => [id, hubStatus]),
  );
  assert.deepEqual(statusById, {
    syllabl: "live",
    rarity: "live",
    "before-after": "live",
    decode: "live",
    token: "live-preview",
    dual: "live-preview",
    expl41n: "coming-soon",
    gridl: "coming-soon",
  });
  assert.ok(catalog.launch.every(({ migrationStatus }) => ["migrated", "native"].includes(migrationStatus)));
});
