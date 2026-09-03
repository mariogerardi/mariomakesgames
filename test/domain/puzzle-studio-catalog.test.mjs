import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { catalogRunwayItem } from "../../src/authoring/catalog-runway.mjs";

const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));

test("the Studio source catalogs cover all currently shipped puzzles", async () => {
  const [syllabl, rarity, beforeAfter, minecraft, decode, dual] = await Promise.all([
    readJson("../../src/games/syllabl/data/puzzles.json"),
    readJson("../../src/games/rarity/data/classic-puzzles.json"),
    readJson("../../src/games/before-after/data/all-puzzles.json"),
    readJson("../../src/games/before-after/data/minecraft.json"),
    readJson("../../src/games/decode/data/puzzles.json"),
    readJson("../../src/games/dual/data/puzzles.fixture.json"),
  ]);
  const decodeIds = new Set([
    ...decode.timed["4"],
    ...decode.timed["5"],
    ...decode.timed["6"],
    ...decode.timed["7"],
    ...decode.daily,
  ].map((puzzle) => puzzle.id));
  assert.equal(syllabl.puzzles.length, 125);
  assert.equal(rarity.puzzles.length, 35);
  assert.equal(beforeAfter.before.length + beforeAfter.after.length + beforeAfter.beforeAfter.length + minecraft.puzzles.length, 204);
  assert.equal(decodeIds.size, 118);
  assert.equal(dual.length, 2);
});

test("the temporary catalog runway supplies coverage without looping", () => {
  const catalog = ["first", "second"];
  assert.equal(catalogRunwayItem(catalog, "2026-09-01"), "first");
  assert.equal(catalogRunwayItem(catalog, "2026-09-02"), "second");
  assert.equal(catalogRunwayItem(catalog, "2026-09-03"), null);
  assert.equal(catalogRunwayItem(catalog, "2026-08-31"), null);
});
