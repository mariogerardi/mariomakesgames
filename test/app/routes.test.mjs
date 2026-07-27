import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repositoryRoot } from "../../src/support/paths.mjs";

const catalog = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "catalog.json"), "utf8"),
);

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("every launch game has an isolated module and an internal route", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  assert.match(routeSource, /generateStaticParams/);

  for (const game of catalog.launch) {
    assert.ok(
      fs.existsSync(
        path.join(repositoryRoot, "src", "games", game.id, "manifest.ts"),
      ),
      `missing module for ${game.id}`,
    );
  }
});

test("the home page routes into the hub rather than legacy deployments", () => {
  const homeSource = read("app/page.tsx");
  const cardSource = read("src/app-shell/game-card.tsx");
  assert.match(cardSource, /href=\{`\/games\/\$\{game\.id\}`\}/);
  assert.doesNotMatch(homeSource, /mariogerardi\.github\.io/);
  assert.doesNotMatch(cardSource, /https?:\/\//);
});

test("the shared shell exposes accessible navigation and page landmarks", () => {
  const homeSource = read("app/page.tsx");
  const headerSource = read("src/app-shell/site-header.tsx");
  const footerSource = read("src/app-shell/site-footer.tsx");

  assert.match(homeSource, /<main>/);
  assert.match(homeSource, /<h1>/);
  assert.match(headerSource, /aria-label="Primary navigation"/);
  assert.match(footerSource, /<footer/);
});

test("H2 does not request persistence or upload infrastructure", () => {
  const hosting = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, ".openai", "hosting.json"),
      "utf8",
    ),
  );
  assert.equal(hosting.d1, null);
  assert.equal(hosting.r2, null);
  assert.equal(typeof hosting.project_id, "string");
});

test("the Syllabl route exposes the complete playable migration", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/syllabl/syllabl-game.tsx");
  assert.match(routeSource, /SyllablGame/);
  assert.match(gameSource, /handleSubmit/);
  assert.match(gameSource, /createSyllablWordValidator/);
  assert.match(gameSource, /syllablDailyStorageKey/);
  assert.match(gameSource, /handleShare/);
  assert.match(gameSource, /Six for six/);
  assert.doesNotMatch(gameSource, /frequency|Rarity score/);
});

test("the Rarity route exposes the complete playable migration", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/rarity/rarity-game.tsx");
  assert.match(routeSource, /RarityGame/);
  assert.match(gameSource, /handleSubmit/);
  assert.match(gameSource, /validateRarityLocalRules/);
  assert.match(gameSource, /submitResultToLeaderboard/);
  assert.match(gameSource, /rarityDailyStorageKey/);
  assert.match(gameSource, /handleShare/);
  assert.match(gameSource, /first valid word locks/i);
});

test("the starter preview is gone and social metadata is project-specific", () => {
  const layoutSource = read("app/layout.tsx");
  assert.doesNotMatch(layoutSource, /codex-preview|Starter Project/);
  assert.match(layoutSource, /Games by Mario Gerardi/);
  assert.match(layoutSource, /summary_large_image/);
  assert.ok(fs.existsSync(path.join(repositoryRoot, "public", "og.png")));
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, "app", "_sites-preview")),
    false,
  );
});
